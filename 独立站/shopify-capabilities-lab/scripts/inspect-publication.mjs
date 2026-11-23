import { graphql } from './store-api.mjs'
console.log(JSON.stringify(await graphql(`query {
  products(first: 10, query: "tag:shopify-capabilities-lab-v1") { nodes {
    handle status onlineStoreUrl publishedAt
    resourcePublicationsV2(first: 10) { nodes { isPublished publication { id name } } }
  } }
  pages(first: 50) { nodes { id handle title isPublished } }
}`), null, 2))
