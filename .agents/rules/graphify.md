# Graphify Workflow Rule

1. **Use Graphify First**: Whenever answering questions about the architecture, symbols, connections, or codebase structure, query `graphify` (`graphify query "<question>"`) instead of reading all files from scratch.
2. **Incremental Updates**: Whenever source files are added, modified, or deleted, run `graphify update` (or `/graphify . --update`) to keep the knowledge graph synchronized with minimal overhead.
3. **Ignore Artifacts**: Keep `graphify-out/` in `.gitignore` so local knowledge graph outputs do not pollute repository commits.
