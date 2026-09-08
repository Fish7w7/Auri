exports.default = async function beforePack() {
  const { prepareEmbedded, embeddedConfig, validateEdgeStoreUrl } = await import('../build/prepare-browser-extension.mjs')
  validateEdgeStoreUrl(embeddedConfig.edgeStoreUrl)
  await prepareEmbedded()
  const { prepareProductionPackaging } = await import('./native-host-production.js')
  prepareProductionPackaging({ requireRelease: true })
}
