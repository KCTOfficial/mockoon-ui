import { EnvironmentSchema, HighestMigrationId, Migrations, repairRefs } from '@mockoon/commons';
import { Environment } from '@/types/mockoon';

/**
 * Brings an environment to the current Mockoon format, the same way the Mockoon CLI does before
 * starting one: apply pending migrations, fill schema defaults (tlsOptions, cors, headers, ...)
 * and drop unknown keys. Without this, MockoonServer crashes on files missing those fields.
 */
export function normalizeEnvironment(environment: any): Environment {
    if (environment.lastMigration > HighestMigrationId) {
        throw new Error('Environment was saved by a newer Mockoon version; update @mockoon/commons');
    }

    try {
        Migrations.forEach((migration) => {
            if (migration.id > environment.lastMigration) {
                migration.migrationFunction(environment);
            }
        });
    } catch {
        environment.lastMigration = HighestMigrationId;
    }

    const validated = EnvironmentSchema.validate(environment).value;
    if (!validated) {
        throw new Error('Invalid Mockoon environment');
    }
    return repairRefs(validated) as unknown as Environment;
}
