export type Methods = 'all' | 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'propfind' | 'proppatch' | 'move' | 'copy' | 'mkcol' | 'lock' | 'unlock';

export type BodyTypes = 'INLINE' | 'FILE' | 'DATABUCKET';

export type ResponseMode = 'RANDOM' | 'SEQUENTIAL' | 'DISABLE_RULES' | 'FALLBACK' | null;

export type LogicalOperators = 'AND' | 'OR';

export interface Header {
    key: string;
    value: string;
}

export interface ResponseRule {
    target: 'body' | 'query' | 'header' | 'cookie' | 'params' | 'path' | 'method' | 'request_number' | 'global_var' | 'data_bucket' | 'templating';
    modifier: string;
    value: string;
    invert: boolean;
    operator: 'equals' | 'regex' | 'regex_i' | 'null' | 'empty_array' | 'array_includes' | 'valid_json_schema';
}

export interface CallbackInvocation {
    uuid: string;
    latency: number;
}

export interface Response {
    uuid: string;
    body: string;
    latency: number;
    statusCode: number;
    label: string;
    headers: Header[];
    bodyType: BodyTypes;
    filePath: string;
    databucketID: string;
    sendFileAsBody: boolean;
    rules: ResponseRule[];
    rulesOperator: LogicalOperators;
    disableTemplating: boolean;
    fallbackTo404: boolean;
    default: boolean;
    crudKey: string;
    callbacks: CallbackInvocation[];
}

export interface Route {
    uuid: string;
    type: 'http' | 'crud' | 'ws';
    documentation: string;
    method: Methods | '';
    endpoint: string;
    responses: Response[];
    responseMode: ResponseMode;
    streamingMode: 'UNICAST' | 'BROADCAST' | null;
    streamingInterval: number;
}

export interface FolderChild {
    type: 'route' | 'folder';
    uuid: string;
}

export interface Folder {
    uuid: string;
    name: string;
    children: FolderChild[];
}

export interface TLSOptions {
    enabled: boolean;
    type: 'PFX' | 'CERT';
    pfxPath: string;
    certPath: string;
    keyPath: string;
    caPath: string;
    passphrase: string;
}

export interface DataBucket {
    uuid: string;
    id: string;
    name: string;
    documentation: string;
    value: string;
}

export interface Callback {
    uuid: string;
    id: string;
    name: string;
    documentation: string;
    method: Methods;
    uri: string;
    headers: Header[];
    body: string;
    bodyType: BodyTypes;
    filePath: string;
    sendFileAsBody: boolean;
    databucketID: string;
}

export interface Environment {
    uuid: string;
    lastMigration: number;
    name: string;
    endpointPrefix: string;
    latency: number;
    port: number;
    hostname: string;
    folders: Folder[];
    routes: Route[];
    rootChildren: FolderChild[];
    proxyMode: boolean;
    proxyHost: string;
    proxyRemovePrefix: boolean;
    tlsOptions: TLSOptions;
    cors: boolean;
    headers: Header[];
    proxyReqHeaders: Header[];
    proxyResHeaders: Header[];
    data: DataBucket[];
    callbacks: Callback[];
    filename?: string; // Virtual field added by the UI
}

export interface LogEntry {
    type: 'out' | 'error';
    data: string;
    timestamp: string;
}
