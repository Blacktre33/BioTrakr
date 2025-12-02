const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@biotrakr/config") {
    return require("../../../config/dist/index.js");
  }

  if (request === "@biotrakr/types") {
    return require("../../../types/dist/index.js");
  }

  return originalLoad(request, parent, isMain);
};

