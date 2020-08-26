const parser = require('fast-xml-parser')
const fs = require('fs').promises

module.exports = {
  parseCamt053: async (path) => {
    const buffer = await fs.readFile(path)
    const camt035 = parser.parse(buffer.toString('utf8'))
    return camt035.Document.BkToCstmrStmt.Ntry.Stmt.Ntry
  }
}
