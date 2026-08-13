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

const log = {
  id: "cmr00cvh40001t79glsuc2tji",
  entityName: "Party",
  entityId: "cmr00cvgz0000t79gh8brxndg",
  action: "create",
  payload: "{\"role\":\"system\",\"before\":null,\"after\":{\"id\":\"cmr00cvgz0000t79gh8brxndg\",\"partyName\":\"Test Party E2E\",\"phone\":\"1231231234\",\"address\":\"QA City\",\"createdAt\":\"2026-06-30T02:08:53.843Z\",\"updatedAt\":\"2026-06-30T02:08:53.843Z\"},\"reason\":null}",
  createdAt: "2026-06-30T02:08:53.848Z"
};

const snakeLog = toSnakeCase(log);
console.log(snakeLog);
