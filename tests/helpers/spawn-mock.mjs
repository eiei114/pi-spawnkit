import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

class MockChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killCalls = [];

  kill(signal) {
    this.killCalls.push(signal);
    return true;
  }
}

export function createMockSpawn(script) {
  const calls = [];
  const spawn = (command, args, options) => {
    const child = new MockChild();
    calls.push({ command, args, options, child });
    script(child, { command, args, options });
    return child;
  };

  return { calls, spawn };
}
