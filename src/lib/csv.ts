/** Quote cells and neutralize spreadsheet formula prefixes in untrusted text. */
export function csvCell(value: unknown): string {
  let str = value == null ? '' : String(value)
  if (typeof value === 'string' && (/^[\t\r]/.test(str) || /^\s*[=+@-]/.test(str))) str = "'" + str
  return '"' + str.replaceAll('"', '""') + '"'
}
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
