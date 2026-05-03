import { describe, expect, it } from 'vitest';
import { EventEmitter, PassThrough } from 'node:stream';
import { spawnLlamaServer } from '../packages/rpc-adapter/src/spawn.js';

/**
 * Build a fake child process whose stderr we control. Lets us drive
 * the spawn handle's parser + ready promise through canned llama.cpp
 * stderr lines without ever invoking a real binary.
 */
function makeFakeChild() {
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => { child.emit('exit', 0, null); };
    return child;
}

describe('spawnLlamaServer', () => {
    it('passes --rpc with comma-joined peer list and --model + binds host/port', async () => {
        let captured = null;
        const fakeChild = makeFakeChild();
        const fakeSpawn = (cmd, args) => { captured = { cmd, args }; return fakeChild; };

        const handle = await spawnLlamaServer({
            modelPath: '/models/qwen-72b.gguf',
            rpcPeers: [
                { host: '10.0.0.7', port: 50052 },
                { host: '10.0.0.8', port: 50053 }
            ],
            host: '127.0.0.1',
            port: 8080,
            spawnFn: fakeSpawn
        });

        expect(captured.cmd).toBe('llama-server');
        expect(captured.args).toContain('--model');
        expect(captured.args).toContain('/models/qwen-72b.gguf');
        expect(captured.args).toContain('--host');
        expect(captured.args).toContain('127.0.0.1');
        expect(captured.args).toContain('--port');
        expect(captured.args).toContain('8080');
        expect(captured.args).toContain('--rpc');
        expect(captured.args).toContain('10.0.0.7:50052,10.0.0.8:50053');
        handle.kill();
    });

    it('caps peer list at MAX_RPC_PEERS', async () => {
        let captured = null;
        const fakeChild = makeFakeChild();
        const peers = Array.from({ length: 20 }, (_, i) => ({ host: `peer-${i}`, port: 50052 + i }));
        await spawnLlamaServer({
            modelPath: '/m.gguf',
            rpcPeers: peers,
            spawnFn: (cmd, args) => { captured = { cmd, args }; return fakeChild; }
        });
        const rpcArg = captured.args[captured.args.indexOf('--rpc') + 1];
        expect(rpcArg.split(',').length).toBe(8);
        fakeChild.kill();
    });

    it('omits --rpc entirely when no valid peers are passed', async () => {
        let captured = null;
        const fakeChild = makeFakeChild();
        await spawnLlamaServer({
            modelPath: '/m.gguf',
            rpcPeers: [],
            spawnFn: (cmd, args) => { captured = { cmd, args }; return fakeChild; }
        });
        expect(captured.args).not.toContain('--rpc');
        fakeChild.kill();
    });

    it('ready promise resolves when stderr emits the listening line', async () => {
        const fakeChild = makeFakeChild();
        const handle = await spawnLlamaServer({
            modelPath: '/m.gguf',
            rpcPeers: [{ host: 'a', port: 50052 }],
            spawnFn: () => fakeChild
        });

        // Drive a realistic startup transcript through stderr.
        setTimeout(() => {
            fakeChild.stderr.write('loading: 50%\n');
            fakeChild.stderr.write('main: server is listening on http://127.0.0.1:8080 - starting\n');
        }, 5);

        const info = await handle.ready;
        expect(info).toEqual({ host: '127.0.0.1', port: 8080 });
        expect(handle.serverInfo).toEqual({ host: '127.0.0.1', port: 8080 });
        handle.kill();
    });

    it('events() yields parsed stderr in order, including layer assignments', async () => {
        const fakeChild = makeFakeChild();
        const handle = await spawnLlamaServer({
            modelPath: '/m.gguf',
            rpcPeers: [{ host: 'a', port: 50052 }],
            spawnFn: () => fakeChild
        });

        setTimeout(() => {
            fakeChild.stderr.write('main: server is listening on http://127.0.0.1:8080\n');
            fakeChild.stderr.write('load_tensors: layer 0 assigned to device RPC[a:50052]\n');
            fakeChild.stderr.write('load_tensors: layer 1 assigned to device RPC[a:50052]\n');
            fakeChild.stderr.write('llama_print_timings: load time = 1234 ms\n'); // unparsed → log
            fakeChild.kill();
        }, 5);

        const collected = [];
        for await (const ev of handle.events()) {
            collected.push(ev);
            if (collected.length >= 5) break;
        }

        expect(collected[0]).toMatchObject({ type: 'server_ready', host: '127.0.0.1', port: 8080 });
        expect(collected[1]).toMatchObject({
            type: 'layer_assigned',
            layer: 0,
            peer: { kind: 'rpc', host: 'a', port: 50052 }
        });
        expect(collected[2]).toMatchObject({
            type: 'layer_assigned',
            layer: 1,
            peer: { kind: 'rpc', host: 'a', port: 50052 }
        });
        // The unparsed line surfaces as a `log` synthetic event so the
        // daemon can relay it.
        expect(collected[3]).toMatchObject({ type: 'log' });
        expect(collected[3].text).toMatch(/llama_print_timings/);
    });

    it('rejects ready promise when the child exits before listening', async () => {
        const fakeChild = makeFakeChild();
        const handle = await spawnLlamaServer({
            modelPath: '/m.gguf',
            rpcPeers: [{ host: 'a', port: 50052 }],
            spawnFn: () => fakeChild
        });

        setTimeout(() => fakeChild.emit('exit', 1, null), 5);

        await expect(handle.ready).rejects.toThrow(/exited before ready/);
    });

    it('throws when modelPath is missing', async () => {
        await expect(spawnLlamaServer({
            rpcPeers: [],
            spawnFn: () => makeFakeChild()
        })).rejects.toThrow(/modelPath is required/);
    });
});
