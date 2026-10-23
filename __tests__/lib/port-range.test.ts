/**
 * @jest-environment node
 */
import { checkPort, findFreePort, getPortRange, portForImport } from '@/server/lib/port-range';
import { loadEnvironments } from '@/server/lib/data-dir';

jest.mock('@/server/lib/data-dir', () => ({ loadEnvironments: jest.fn() }));
jest.mock('@/server/lib/settings', () => ({ getSettings: () => null, getUiPort: () => 7001 }));

const mockEnvs = (envs: { name: string; port: number; filename: string }[]) =>
    (loadEnvironments as jest.Mock).mockReturnValue(envs);

describe('port-range', () => {
    const original = process.env.MOCKOON_PORT_RANGE;

    beforeEach(() => {
        process.env.MOCKOON_PORT_RANGE = '7002-7004';
        mockEnvs([]);
    });

    afterAll(() => {
        if (original === undefined) delete process.env.MOCKOON_PORT_RANGE;
        else process.env.MOCKOON_PORT_RANGE = original;
    });

    describe('getPortRange', () => {
        it('defaults to every port when unset', () => {
            delete process.env.MOCKOON_PORT_RANGE;
            expect(getPortRange()).toEqual({ min: 1, max: 65535 });
        });

        it('accepts the ufw "min:max" form', () => {
            process.env.MOCKOON_PORT_RANGE = '7002:7020';
            expect(getPortRange()).toEqual({ min: 7002, max: 7020 });
        });

        it.each(['abc', '7020-7002', '0-10', '7002-70000', '7002'])('rejects "%s"', (value) => {
            process.env.MOCKOON_PORT_RANGE = value;
            expect(() => getPortRange()).toThrow('Invalid MOCKOON_PORT_RANGE');
        });
    });

    describe('checkPort', () => {
        it('accepts a free port inside the range', () => {
            expect(checkPort(7003)).toBeNull();
        });

        it('rejects the UI port even without a range', () => {
            delete process.env.MOCKOON_PORT_RANGE;
            expect(checkPort(7001)).toBe('Port 7001 is used by Mockoon UI');
        });

        it.each([7001, 7005, 7002.5, '7002', undefined])('rejects %p', (port) => {
            expect(checkPort(port)).toBe('Valid port number is required (7002-7004)');
        });

        it('rejects a port used by another environment', () => {
            mockEnvs([{ name: 'Shop', port: 7003, filename: 'shop.json' }]);
            expect(checkPort(7003)).toBe('Port 7003 is already used by environment "Shop"');
        });

        it('ignores the environment being edited', () => {
            mockEnvs([{ name: 'Shop', port: 7003, filename: 'shop.json' }]);
            expect(checkPort(7003, 'shop.json')).toBeNull();
        });
    });

    describe('findFreePort / portForImport', () => {
        beforeEach(() => {
            mockEnvs([
                { name: 'A', port: 7002, filename: 'a.json' },
                { name: 'B', port: 7004, filename: 'b.json' },
            ]);
        });

        it('returns the first unused port', () => {
            expect(findFreePort()).toBe(7003);
        });

        it('keeps a usable imported port and replaces an unusable one', () => {
            mockEnvs([{ name: 'A', port: 7002, filename: 'a.json' }]);
            expect(portForImport(7004)).toBe(7004);
            expect(portForImport(3000)).toBe(7003);
            expect(portForImport(7002)).toBe(7003);
        });

        it('returns null when the range is full', () => {
            mockEnvs([7002, 7003, 7004].map(port => ({ name: `E${port}`, port, filename: `${port}.json` })));
            expect(findFreePort()).toBeNull();
            expect(portForImport(3000)).toBeNull();
        });
    });
});
