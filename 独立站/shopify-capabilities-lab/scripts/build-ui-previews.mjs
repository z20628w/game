import { readFile, writeFile } from 'node:fs/promises'

const directory = 'theme/templates'
const readTemplate = async type => JSON.parse(await readFile(`${directory}/${type}.json`, 'utf8'))
const writeTemplate = (name, template) => writeFile(`${directory}/${name}.json`, `${JSON.stringify(template, null, 2)}\n`)

const [product, collection] = await Promise.all([readTemplate('product'), readTemplate('collection')])
// 从当前默认模板派生，只改用于对比的选项，保留原有商品区块与布局设置。
product.sections.main.settings.media_position = 'right'
product.sections.main.blocks.variant_picker.settings.picker_type = 'dropdown'

const collectionPreviews = {
  'lab-grid': { columns_desktop: 2, columns_mobile: '1', quick_add: 'standard' },
  'lab-sidebar': { filter_type: 'vertical' },
  'lab-filter-drawer': { filter_type: 'drawer' }
}

await Promise.all([
  writeTemplate('product.lab-product', product),
  ...Object.entries(collectionPreviews).map(([suffix, settings]) => {
    // 每种布局以相同基础模板开始，避免前一个示例的列数或筛选设置串到下一个。
    const preview = structuredClone(collection)
    Object.assign(preview.sections['product-grid'].settings, settings)
    return writeTemplate(`collection.${suffix}`, preview)
  })
])
