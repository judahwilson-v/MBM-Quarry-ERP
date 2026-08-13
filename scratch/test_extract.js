function extractEntityData(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    throw new Error("Sync payload must be a JSON object.");
  }

  const payload = rawPayload;
  if (Object.prototype.hasOwnProperty.call(payload, "after")) {
    if (!payload.after || typeof payload.after !== "object" || Array.isArray(payload.after)) {
      throw new Error("Create/update audit payload is missing its entity snapshot.");
    }
    return payload.after;
  }
  return payload;
}

function toSnakeCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map((v) => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      result[snakeKey] = toSnakeCase(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

const payloadStr = "{\"role\":\"system\",\"before\":null,\"after\":{\"id\":\"cmr00cvgz0000t79gh8brxndg\",\"partyName\":\"Test Party E2E\",\"phone\":\"1231231234\",\"address\":\"QA City\",\"createdAt\":\"2026-06-30T02:08:53.843Z\",\"updatedAt\":\"2026-06-30T02:08:53.843Z\"},\"reason\":null}";

const entityData = extractEntityData(JSON.parse(payloadStr));
const snakeData = toSnakeCase(entityData);

console.log("entityData:");
console.log(entityData);
console.log("snakeData:");
console.log(snakeData);
