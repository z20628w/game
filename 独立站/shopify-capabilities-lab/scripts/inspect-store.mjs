import { graphql } from './store-api.mjs'
const data = await graphql(`query {
  shop { name currencyCode primaryDomain { url } }
  publications(first: 20) { nodes { id name } }
  products(first: 10, query: "tag:演示") { nodes { id title handle tags } }
  metaobjectDefinitionByType(type: "lab_demo_guide") { id type }
  productInput: __type(name: "ProductCreateInput") { inputFields { name } }
  pageInput: __type(name: "PageCreateInput") { inputFields { name } }
}`)
console.log(JSON.stringify(data, null, 2))
