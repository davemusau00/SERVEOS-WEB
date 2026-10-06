import {createHash} from 'node:crypto';

const MAX_COMMAND_BYTES = 256 * 1024;

export class ApiProblem extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateCommandEnvelope(input) {
  if (!isObject(input)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Command must be an object.');
  const {commandId, name, payload, expectedVersions = {}, offlineGrantId} = input;
  if (typeof commandId !== 'string' || !/^[0-9a-f-]{36}$/i.test(commandId)) {
    throw new ApiProblem(400, 'VALIDATION_FAILED', 'commandId must be a UUID.');
  }
  if (typeof name !== 'string' || !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(name)) {
    throw new ApiProblem(400, 'VALIDATION_FAILED', 'name must be a registered command name.');
  }
  if (!isObject(payload) || !isObject(expectedVersions)) {
    throw new ApiProblem(400, 'VALIDATION_FAILED', 'payload and expectedVersions must be objects.');
  }
  const bytes = Buffer.byteLength(JSON.stringify(input));
  if (bytes > MAX_COMMAND_BYTES) throw new ApiProblem(413, 'PAYLOAD_TOO_LARGE', 'Command payload exceeds the allowed size.');
  if (offlineGrantId !== undefined && (typeof offlineGrantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(offlineGrantId))) {
    throw new ApiProblem(400, 'VALIDATION_FAILED', 'offlineGrantId must be a UUID.');
  }
  const command = {commandId, name, payload, expectedVersions};
  if (offlineGrantId !== undefined) command.offlineGrantId = offlineGrantId;
  return command;
}

export function commandHash(command) {
  return createHash('sha256').update(JSON.stringify({
    name: command.name,
    payload: command.payload,
    expectedVersions: command.expectedVersions,
    offlineGrantId: command.offlineGrantId ?? null,
  })).digest('hex');
}

export function normalizeActor(actor) {
  if (!actor || typeof actor.businessId !== 'string' || typeof actor.staffId !== 'string' || typeof actor.deviceId !== 'string') {
    throw new ApiProblem(401, 'AUTH_REQUIRED', 'An authenticated staff and enrolled device session is required.');
  }
  return actor;
}

export async function executeCommand({db, command: input, actor: actorInput, registry, now = () => new Date()}) {
  const command = validateCommandEnvelope(input);
  const actor = normalizeActor(actorInput);
  const definition = registry.get(command.name);
  if (!definition) throw new ApiProblem(404, 'UNKNOWN_COMMAND', 'This command is not available on this API version.');

  if (!actor.permissions?.includes(definition.permission)) {
    throw new ApiProblem(403, 'PERMISSION_DENIED', 'You are not allowed to perform this action.');
  }
  if (definition.offlinePolicy === 'ONLINE_ONLY' && command.offlineGrantId) {
    throw new ApiProblem(403, 'OFFLINE_NOT_ALLOWED', 'This action must be performed while connected.');
  }
  if (definition.offlinePolicy === 'GRANTED_ONLY' && !command.offlineGrantId) {
    throw new ApiProblem(403, 'OFFLINE_GRANT_REQUIRED', 'An active offline grant is required for this action.');
  }

  const hash = commandHash(command);
  return db.transaction(async tx => {
    const existing = await tx.getCommand(actor.businessId, command.commandId);
    if (existing) {
      if (existing.payloadHash !== hash) throw new ApiProblem(409, 'COMMAND_ID_REUSED', 'This command ID was already used with a different payload.');
      return existing.outcome;
    }

    if (typeof tx.lockCommandKey === 'function') await tx.lockCommandKey(actor.businessId, command.commandId);
    const afterLock = await tx.getCommand(actor.businessId, command.commandId);
    if (afterLock) {
      if (afterLock.payloadHash !== hash) throw new ApiProblem(409, 'COMMAND_ID_REUSED', 'This command ID was already used with a different payload.');
      return afterLock.outcome;
    }

    if (command.offlineGrantId) {
      await tx.consumeOfflineGrant({
        grantId: command.offlineGrantId,
        businessId: actor.businessId,
        deviceId: actor.deviceId,
        staffId: actor.staffId,
        commandName: command.name,
        commandId: command.commandId,
        at: now(),
      });
    }

    const result = await definition.handler({tx, command, actor, at: now()});
    const cursor = await tx.nextChangeCursor(actor.businessId);
    const outcome = {kind: 'CONFIRMED', commandId: command.commandId, result, cursor};
    await tx.insertCommand({
      businessId: actor.businessId,
      commandId: command.commandId,
      name: command.name,
      payloadHash: hash,
      actor,
      outcome,
      at: now(),
    });
    await tx.insertAudit({businessId: actor.businessId, commandId: command.commandId, name: command.name, actor, at: now()});
    await tx.insertChange({businessId: actor.businessId, cursor, commandId: command.commandId, name: command.name, result, at: now()});
    return outcome;
  });
}
