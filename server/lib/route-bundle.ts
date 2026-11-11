import { v4 as uuidv4 } from 'uuid';
import { HighestMigrationId } from '@mockoon/commons';
import { Callback, DataBucket, Environment, Folder, FolderChild, Route } from '@/types/mockoon';
import { normalizeEnvironment } from './normalize-env';

/**
 * Routes (HTTP, CRUD, WebSocket) and folders moving between environments: copy/move, export to a file and
 * import from one. Data buckets and callbacks the routes use travel with them so they keep working.
 */

export type ItemType = 'route' | 'folder';

/** Marks a file written by "Export" so it can be told apart from a full environment on import. */
export const BUNDLE_MARKER = 'mockoon-ui/routes';
export const BUNDLE_VERSION = 1;

// {{data 'x'}}, {{dataRaw 'x'}} and {{setData 'op' 'x' ...}} look a bucket up by id or (part of its) name
const DATA_HELPER = /\{\{\s*#?\s*(?:data|dataRaw)\s+(?:'([^']+)'|"([^"]+)")/g;
const SET_DATA_HELPER = /\{\{\s*setData\s+(?:'[^']*'|"[^"]*")\s+(?:'([^']+)'|"([^"]+)")/g;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const endpointKey = (route: Route) => `${route.type} ${route.method} ${route.endpoint.replace(/^\/+/, '')}`;

export const describeRoute = (route: Route) =>
    `${(route.method || route.type).toUpperCase()} /${route.endpoint.replace(/^\/+/, '')}`;

function templatingRefs(text: string | undefined): string[] {
    if (!text) return [];
    const refs: string[] = [];
    for (const regex of [DATA_HELPER, SET_DATA_HELPER]) {
        for (const match of text.matchAll(regex)) refs.push(match[1] ?? match[2]);
    }
    return refs;
}

/** Routes and folders under the given tree entries (folders with their whole subtree), in tree order. */
export function collect(env: Environment, roots: FolderChild[]): { routes: Route[]; folders: Folder[] } {
    const routes: Route[] = [];
    const folders: Folder[] = [];
    const seen = new Set<string>(); // a malformed file could list an entry twice or contain a cycle
    const visit = (child: FolderChild) => {
        if (seen.has(child.uuid)) return;
        seen.add(child.uuid);
        if (child.type === 'route') {
            const route = env.routes.find(r => r.uuid === child.uuid);
            if (route) routes.push(route);
            return;
        }
        const folder = env.folders.find(f => f.uuid === child.uuid);
        if (!folder) return;
        folders.push(folder);
        folder.children.forEach(visit);
    };
    roots.forEach(visit);
    return { routes, folders };
}

/** The tree entry for a route or folder uuid, or null when the environment has no such item. */
export function findItem(env: Environment, type: unknown, uuid: unknown): FolderChild | null {
    if ((type !== 'route' && type !== 'folder') || typeof uuid !== 'string' || !uuid) return null;
    const exists = type === 'route' ? env.routes.some(r => r.uuid === uuid) : env.folders.some(f => f.uuid === uuid);
    return exists ? { type, uuid } : null;
}

/** Data buckets and callbacks the routes use. */
export function dependencies(env: Environment, routes: Route[]): { buckets: DataBucket[]; callbacks: Callback[] } {
    const callbackUuids = new Set<string>();
    const bucketIds = new Set<string>();
    const bucketRefs = new Set<string>();

    routes.forEach(route => route.responses.forEach(response => {
        if (response.databucketID) bucketIds.add(response.databucketID);
        response.callbacks?.forEach(c => callbackUuids.add(c.uuid));
        [response.body, response.filePath, ...(response.headers ?? []).map(h => h.value)].forEach(text =>
            templatingRefs(text).forEach(ref => bucketRefs.add(ref)));
        (response.rules ?? []).forEach(rule => {
            if (rule.target === 'data_bucket' && rule.modifier) bucketRefs.add(rule.modifier.split('.')[0]);
            if (rule.operator === 'valid_json_schema' && rule.value) bucketRefs.add(rule.value.split('.')[0]);
        });
    }));

    const callbacks = env.callbacks.filter(c => callbackUuids.has(c.uuid));
    callbacks.forEach(callback => {
        if (callback.databucketID) bucketIds.add(callback.databucketID);
        [callback.body, callback.uri, callback.filePath, ...(callback.headers ?? []).map(h => h.value)].forEach(text =>
            templatingRefs(text).forEach(ref => bucketRefs.add(ref)));
    });

    // Same lookup as Mockoon: exact id, or a name containing the reference (case-insensitive)
    const buckets = env.data.filter(bucket =>
        bucketIds.has(bucket.id) ||
        [...bucketRefs].some(ref => bucket.id === ref || bucket.name.toLowerCase().includes(ref.toLowerCase())));

    return { buckets, callbacks };
}

export interface InsertResult {
    /** New tree entries added to the destination, in order */
    refs: FolderChild[];
    routeCount: number;
    folderCount: number;
    bucketCount: number;
    callbackCount: number;
    warnings: string[];
}

/** Most routes/folders one bulk request may name. */
export const MAX_BULK_ITEMS = 1000;
const MAX_FOLDER_NAME_LENGTH = 100;

/**
 * Tree entries from a request body: `items: [{ type, uuid }]`, each one present in `env`.
 * Duplicates and entries inside another listed folder are dropped (they travel with that folder).
 */
export function findItems(env: Environment, items: unknown): FolderChild[] {
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BULK_ITEMS) {
        throw new TransferError(`Pick 1-${MAX_BULK_ITEMS} routes or folders`, 400);
    }
    const roots = items.map(item => {
        const { type, uuid } = (item && typeof item === 'object' ? item : {}) as { type?: unknown; uuid?: unknown };
        const found = findItem(env, type, uuid);
        if (!found) throw new TransferError('Route or folder not found', 404);
        return found;
    });
    return topLevelOnly(env, roots);
}

/** Drops duplicate entries and entries nested in another listed folder; keeps the order given. */
export function topLevelOnly(env: Environment, roots: FolderChild[]): FolderChild[] {
    const seen = new Set<string>();
    const unique = roots.filter(root => !seen.has(root.uuid) && !!seen.add(root.uuid));
    const nested = new Set<string>();
    unique.filter(root => root.type === 'folder').forEach(root => {
        const { routes, folders } = collect(env, [root]);
        routes.forEach(r => nested.add(r.uuid));
        folders.forEach(f => { if (f.uuid !== root.uuid) nested.add(f.uuid); });
    });
    return unique.filter(root => !nested.has(root.uuid));
}

/** True when `candidateUuid` is the folder `folderUuid` or anywhere inside it. */
export function isInsideFolder(env: Environment, folderUuid: string, candidateUuid: string): boolean {
    return folderUuid === candidateUuid ||
        collect(env, [{ type: 'folder', uuid: folderUuid }]).folders.some(f => f.uuid === candidateUuid);
}

/**
 * The folder items go into: `folderUuid` (null: top level), or, with `newFolderName`, a new folder created
 * inside it. Throws before changing anything when the folder is missing or the name is invalid.
 */
export function prepareDestination(env: Environment, folderUuid: string | null, newFolderName: unknown): string | null {
    const parent = folderUuid ? env.folders.find(f => f.uuid === folderUuid) : null;
    if (folderUuid && !parent) throw new TransferError('Target folder not found', 404);
    if (newFolderName === undefined || newFolderName === null) return folderUuid;

    const name = typeof newFolderName === 'string' ? newFolderName.trim() : '';
    if (!name || name.length > MAX_FOLDER_NAME_LENGTH) {
        throw new TransferError(`Folder name must be 1-${MAX_FOLDER_NAME_LENGTH} characters`, 400);
    }
    const folder: Folder = { uuid: uuidv4(), name, children: [] };
    env.folders.push(folder);
    (parent ? parent.children : env.rootChildren).push({ type: 'folder', uuid: folder.uuid });
    return folder.uuid;
}

/**
 * Moves tree entries inside their own environment (uuids stay). Entries already in the destination keep
 * their place. A folder cannot go into itself or one of its subfolders.
 */
export function relocateItems(env: Environment, roots: FolderChild[], destinationFolderUuid: string | null) {
    const destination = destinationFolderUuid ? env.folders.find(f => f.uuid === destinationFolderUuid) : null;
    if (destinationFolderUuid && !destination) throw new TransferError('Target folder not found', 404);
    if (destinationFolderUuid && roots.some(root => root.type === 'folder' && isInsideFolder(env, root.uuid, destinationFolderUuid))) {
        throw new TransferError('A folder cannot be moved into itself', 400);
    }
    const container = destination ? destination.children : env.rootChildren;
    roots.forEach(root => {
        if (container.some(c => c.uuid === root.uuid)) return;
        env.rootChildren = env.rootChildren.filter(c => c.uuid !== root.uuid);
        env.folders.forEach(f => { f.children = f.children.filter(c => c.uuid !== root.uuid); });
        // Re-read: the filter above may have replaced env.rootChildren
        (destination ? destination.children : env.rootChildren).push({ type: root.type, uuid: root.uuid });
    });
}

/**
 * Copies `roots` (and everything under them) from `source` into `target`, inside `destinationFolderUuid`
 * or at the top level. Everything copied gets new uuids. Mutates `target` only.
 * With `renameConflicts` (a copy inside the same environment), a route whose path is taken gets "-copy-N"
 * instead of a warning.
 */
export function insertItems(
    source: Environment,
    roots: FolderChild[],
    target: Environment,
    destinationFolderUuid: string | null,
    options: { renameConflicts?: boolean } = {}
): InsertResult {
    const destination = destinationFolderUuid ? target.folders.find(f => f.uuid === destinationFolderUuid) : null;
    if (destinationFolderUuid && !destination) throw new TransferError('Target folder not found', 404);

    const items = collect(source, roots);
    const warnings: string[] = [];

    const ids = new Map<string, string>();
    items.routes.forEach(r => ids.set(r.uuid, uuidv4()));
    items.folders.forEach(f => ids.set(f.uuid, uuidv4()));

    const existingEndpoints = new Set(target.routes.map(endpointKey));
    // Paths taken so far, including the copies made in this call
    const taken: Route[] = [...target.routes];
    const routes: Route[] = items.routes.map(route => {
        const copy: Route = structuredClone(route);
        copy.uuid = ids.get(route.uuid)!;
        copy.responses.forEach(response => { response.uuid = uuidv4(); });
        if (existingEndpoints.has(endpointKey(route))) {
            if (options.renameConflicts) copy.endpoint = copyEndpoint(route, taken);
            else warnings.push(`${describeRoute(route)} already exists in "${target.name}"; the route listed first answers.`);
        }
        taken.push(copy);
        if (options.renameConflicts) existingEndpoints.add(endpointKey(copy));
        return copy;
    });
    const folders: Folder[] = items.folders.map(folder => ({
        ...structuredClone(folder),
        uuid: ids.get(folder.uuid)!,
        children: folder.children
            .filter(child => ids.has(child.uuid))
            .map(child => ({ type: child.type, uuid: ids.get(child.uuid)! })),
    }));

    const { buckets, callbacks } = dependencies(source, items.routes);
    const addedBuckets: DataBucket[] = [];
    buckets.forEach(bucket => {
        const existing = target.data.find(b => b.id === bucket.id);
        if (existing) {
            if (!same({ ...existing, uuid: '' }, { ...bucket, uuid: '' })) {
                warnings.push(`Data bucket "${bucket.name}" (${bucket.id}) already exists in "${target.name}" with other content; the target's version is used.`);
            }
            return;
        }
        if (target.data.some(b => b.name.toLowerCase() === bucket.name.toLowerCase())) {
            warnings.push(`"${target.name}" already has a data bucket named "${bucket.name}"; templates referring to it by name may use either one.`);
        }
        const copy = structuredClone(bucket);
        if (target.data.some(b => b.uuid === copy.uuid)) copy.uuid = uuidv4();
        addedBuckets.push(copy);
    });
    const addedCallbacks: Callback[] = [];
    callbacks.forEach(callback => {
        const existing = target.callbacks.find(c => c.uuid === callback.uuid);
        if (existing) {
            if (!same(existing, callback)) {
                warnings.push(`Callback "${callback.name}" already exists in "${target.name}" with other content; the target's version is used.`);
            }
            return;
        }
        addedCallbacks.push(structuredClone(callback));
    });

    target.routes.push(...routes);
    target.folders.push(...folders);
    target.data.push(...addedBuckets);
    target.callbacks.push(...addedCallbacks);
    const seenRoots = new Set<string>();
    const refs: FolderChild[] = roots
        .filter(root => ids.has(root.uuid) && !seenRoots.has(root.uuid) && seenRoots.add(root.uuid))
        .map(root => ({ type: root.type, uuid: ids.get(root.uuid)! }));
    (destination ? destination.children : target.rootChildren).push(...refs);

    return {
        refs,
        routeCount: routes.length,
        folderCount: folders.length,
        bucketCount: addedBuckets.length,
        callbackCount: addedCallbacks.length,
        warnings,
    };
}

/** Removes an item and its subtree from an environment (after a move). Data buckets and callbacks stay. */
export function removeItem(env: Environment, root: FolderChild) {
    const items = collect(env, [root]);
    const routeIds = new Set(items.routes.map(r => r.uuid));
    const folderIds = new Set(items.folders.map(f => f.uuid));
    env.routes = env.routes.filter(r => !routeIds.has(r.uuid));
    env.folders = env.folders.filter(f => !folderIds.has(f.uuid));
    env.rootChildren = env.rootChildren.filter(c => c.uuid !== root.uuid);
    env.folders.forEach(f => { f.children = f.children.filter(c => c.uuid !== root.uuid); });
}

/** File content for "Export": the item(s), their subtrees and what they use, shaped like a (partial) environment. */
export function buildBundle(env: Environment, root: FolderChild | FolderChild[]) {
    const roots = Array.isArray(root) ? root : [root];
    const items = collect(env, roots);
    const { buckets, callbacks } = dependencies(env, items.routes);
    return {
        type: BUNDLE_MARKER,
        version: BUNDLE_VERSION,
        exportedFrom: env.name,
        exportedAt: new Date().toISOString(),
        lastMigration: env.lastMigration,
        rootChildren: roots,
        folders: items.folders,
        routes: items.routes,
        data: buckets,
        callbacks,
    };
}

/**
 * Reads an uploaded file: an export from this UI, or a whole Mockoon environment (all its routes are taken).
 * Validated and migrated with Mockoon's own schema, like an imported environment.
 */
export function parseBundle(content: unknown): { env: Environment; roots: FolderChild[]; kind: 'bundle' | 'environment' } {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new TransferError('The file is not a routes export or a Mockoon environment', 400);
    }
    const raw = content as Record<string, unknown>;
    const isBundle = raw.type === BUNDLE_MARKER;
    if (!Array.isArray(raw.routes) || (!isBundle && !Array.isArray(raw.rootChildren))) {
        throw new TransferError('The file is not a routes export or a Mockoon environment', 400);
    }
    if (isBundle && typeof raw.version === 'number' && raw.version > BUNDLE_VERSION) {
        throw new TransferError('The file was exported by a newer Mockoon UI', 400);
    }

    let env: Environment;
    try {
        env = normalizeEnvironment({
            ...raw,
            // Only what the schema needs to accept it; these are never written anywhere
            uuid: uuidv4(),
            name: typeof raw.exportedFrom === 'string' ? raw.exportedFrom : (typeof raw.name === 'string' ? raw.name : 'Imported'),
            port: 3000,
            lastMigration: typeof raw.lastMigration === 'number' ? raw.lastMigration : HighestMigrationId,
            folders: Array.isArray(raw.folders) ? raw.folders : [],
            rootChildren: Array.isArray(raw.rootChildren) ? raw.rootChildren : [],
            data: Array.isArray(raw.data) ? raw.data : [],
            callbacks: Array.isArray(raw.callbacks) ? raw.callbacks : [],
        });
    } catch (error) {
        throw new TransferError(error instanceof Error ? error.message : 'Invalid file', 400);
    }
    // repairRefs (in normalize) has put any route missing from the tree at the top level
    const roots = env.rootChildren;
    if (collect(env, roots).routes.length === 0 && env.folders.length === 0) {
        throw new TransferError('The file has no routes or folders', 400);
    }
    return { env, roots, kind: isBundle ? 'bundle' : 'environment' };
}

/**
 * File name for an export: `<environment>-<method>-<path>.json`, `<environment>-folder-<name>.json`,
 * or `<environment>-<n>-items.json` for several items.
 */
export function bundleFilename(env: Environment, roots: FolderChild | FolderChild[]): string {
    const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const list = Array.isArray(roots) ? roots : [roots];
    const root = list[0];
    let item: string;
    if (list.length > 1) {
        item = `${list.length}-items`;
    } else if (root.type === 'route') {
        const route = env.routes.find(r => r.uuid === root.uuid)!;
        const endpoint = slug(route.endpoint) || 'root';
        item = route.type === 'crud' ? `crud-${endpoint}` : `${route.type === 'ws' ? 'ws' : route.method || route.type}-${endpoint}`;
    } else {
        item = `folder-${slug(env.folders.find(f => f.uuid === root.uuid)!.name) || 'untitled'}`;
    }
    return `${(slug(env.name) || 'environment').slice(0, 60)}-${item.slice(0, 80)}.json`;
}

/**
 * "<base> (copy N)" with the lowest N not taken; a trailing "(copy N)" on the original is replaced, so
 * duplicating "API (copy 1)" gives "API (copy 2)", not "API (copy 1) (copy 1)".
 */
export function copyName(name: string, taken: Iterable<string>): string {
    const base = name.replace(/\s*\(copy \d+\)$/i, '').trim() || name;
    const used = new Set([...taken].map(n => n.toLowerCase()));
    for (let i = 1; ; i++) {
        const candidate = `${base} (copy ${i})`;
        if (!used.has(candidate.toLowerCase())) return candidate;
    }
}

/** Same for an endpoint, URL-safe: "users" -> "users-copy-1"; the route must answer on a path of its own. */
export function copyEndpoint(route: Route, routes: Route[]): string {
    const base = route.endpoint.replace(/-copy-\d+$/, '');
    const taken = new Set(routes.filter(r => r.type === route.type && r.method === route.method).map(r => r.endpoint));
    for (let i = 1; ; i++) {
        const candidate = `${base}-copy-${i}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/** New uuids for every route, response and folder, with the tree rebuilt; buckets and callbacks are left as they are. */
export function remapUuids(routes: Route[], folders: Folder[], refs: FolderChild[]) {
    const ids = new Map<string, string>();
    routes.forEach(r => ids.set(r.uuid, uuidv4()));
    folders.forEach(f => ids.set(f.uuid, uuidv4()));
    const mapRef = (c: FolderChild): FolderChild => ({ type: c.type, uuid: ids.get(c.uuid) ?? c.uuid });
    return {
        ids,
        routes: routes.map(route => {
            const copy: Route = structuredClone(route);
            copy.uuid = ids.get(route.uuid)!;
            copy.responses.forEach(response => { response.uuid = uuidv4(); });
            return copy;
        }),
        folders: folders.map(folder => ({
            ...structuredClone(folder),
            uuid: ids.get(folder.uuid)!,
            children: folder.children.filter(c => ids.has(c.uuid)).map(mapRef),
        })),
        refs: refs.map(mapRef),
    };
}

/**
 * Duplicates a route (endpoint gets "-copy-N") or a folder with everything in it (name gets "(copy N)") in the
 * same environment, right after the original. Returns the new tree entry.
 */
export function duplicateItem(env: Environment, root: FolderChild): FolderChild {
    const items = collect(env, [root]);
    const copy = remapUuids(items.routes, items.folders, [root]);
    const top = copy.refs[0];

    if (root.type === 'route') {
        const route = copy.routes[0];
        route.endpoint = copyEndpoint(route, env.routes);
    } else {
        const folder = copy.folders.find(f => f.uuid === top.uuid)!;
        folder.name = copyName(folder.name, env.folders.map(f => f.name));
    }

    env.routes.push(...copy.routes);
    env.folders.push(...copy.folders);
    const container = env.folders.find(f => f.children.some(c => c.uuid === root.uuid))?.children ?? env.rootChildren;
    const index = container.findIndex(c => c.uuid === root.uuid);
    container.splice(index === -1 ? container.length : index + 1, 0, top);
    return top;
}

export class TransferError extends Error {
    constructor(message: string, public status: 400 | 404 | 409) {
        super(message);
    }
}
