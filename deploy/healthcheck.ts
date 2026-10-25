// Container healthcheck: the app must serve pages and reach its tables.
for (const path of ['/', '/healthz']) {
  const response = await fetch('http://127.0.0.1:3001' + path, {
    signal: AbortSignal.timeout(5000)
  })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
}
