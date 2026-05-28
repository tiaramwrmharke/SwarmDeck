import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamOpts, StreamResult } from '../src/agent/types.ts';

const RESPONDER_HEADER = `#!/usr/bin/env python3
import json, sys, time, os, threading

def write(obj):
    sys.stdout.write(json.dumps(obj) + "\\n"); sys.stdout.flush()

def read_request():
    line = sys.stdin.readline()
    if not line: return None
    line = line.strip()
    if not line: return read_request()
    try: return json.loads(line)
    except Exception: return read_request()

# Scenario script tells us what to do for each prompt the driver sends.
SCRIPT = json.loads(os.environ.get("HERMES_SCRIPT", "{}"))

# ---- ACP methods ------------------------------------------------------------

session_id = "sess-test-001"
loaded = False
mode_id = None
model_id = None

while True:
    req = read_request()
    if req is None: break
    method = req.get("method")
    rid = req.get("id")
    params = req.get("params", {}) or {}

    if method == "initialize":
        write({"jsonrpc":"2.0","id":rid,"result":{
            "protocolVersion":1,
            "agentInfo":{"name":"hermes-test","version":"0.0.0"},
            "agentCapabilities":{"loadSession":True,"promptCapabilities":{"image":False}},
        }})
    elif method == "session/new":
        write({"jsonrpc":"2.0","id":rid,"result":{"sessionId": session_id}})
    elif method == "session/load":
        load_behavior = SCRIPT.get("loadBehavior", "ok")
        if load_behavior == "null":
            write({"jsonrpc":"2.0","id":rid,"result":None})
        elif load_behavior == "error":
            write({"jsonrpc":"2.0","id":rid,"error":{"code":-32603,"message":"load failed"}})
        else:
            # Replay events: stream a couple of "old assistant" chunks AFTER
            # the response, simulating how Hermes pushes history-replay
            # session/update events on the event loop.
            write({"jsonrpc":"2.0","id":rid,"result":{}})
            def replay():
                time.sleep(0.05)
                for chunk in SCRIPT.get("replayChunks", []):
                    write({"jsonrpc":"2.0","method":"session/update","params":{
                        "sessionId": session_id,
                        "update":{"sessionUpdate":"agent_message_chunk","content":{"text":chunk}},
                    }})
            threading.Thread(target=replay, daemon=True).start()
    elif method == "session/set_model":
        model_id = params.get("modelId")
        write({"jsonrpc":"2.0","id":rid,"result":{}})
    elif method == "session/set_mode":
