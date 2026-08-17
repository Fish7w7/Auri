export const ANILIST_ENDPOINT = 'https://graphql.anilist.co'

export const SEARCH_QUERY = `
  query SearchManga($search: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: MANGA, isAdult: false, sort: SEARCH_MATCH) {
        id
        title { english romaji native }
        format
        status
        startDate { year month day }
        countryOfOrigin
        coverImage { large extraLarge }
        siteUrl
      }
    }
  }
`

export const DETAILS_QUERY = `
  query MangaDetails($id: Int!) {
    Media(id: $id, type: MANGA) {
      id
      title { english romaji native }
      synonyms
      description(asHtml: false)
      format
      status
      startDate { year month day }
      endDate { year month day }
      countryOfOrigin
      genres
      coverImage { large extraLarge }
      siteUrl
      staff(perPage: 25) { edges { role node { name { full } } } }
    }
  }
`
