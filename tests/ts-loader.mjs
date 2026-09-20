export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) {
      for (const suffix of [".ts", "/index.ts"]) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          // try the next form
        }
      }
    }
    throw error;
  }
}
