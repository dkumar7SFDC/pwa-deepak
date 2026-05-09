/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React from 'react'
import PropTypes from 'prop-types'

import {useCategory} from '@salesforce/commerce-sdk-react'
import {Box, Skeleton} from '@salesforce/retail-react-app/app/components/shared/ui'

import CategoryTile from '@salesforce/retail-react-app/app/components/category-tile'

/**
 * Page Designer adapter for the "Category Tile" / "Featured Category Tile"
 * components.
 *
 * Component type ids consumed (any of these spellings registered in
 * `app/page-designer/registry.js`):
 *   - commerce_assets.categoryTile        (canonical id used in BM today)
 *   - commerce_assets.categorytile        (alias)
 *   - commerce_assets.featuredCategoryTile (alias)
 *   - commerce_assets.featuredcategorytile (alias)
 *
 * IMPORTANT — SCAPI Page Designer payload shape for "category" attributes:
 *
 *   The Page Designer asset definition's `category` attribute serializes a
 *   *reference*, not the full category. SCAPI returns it as a STRING (the
 *   category id), e.g.:
 *
 *     { "category": "mens" }
 *
 *   The full category data (name, image, online flag, etc.) has to be
 *   fetched separately via `useCategory({ parameters: { id } })`.
 *
 *   For backwards-compatibility we also accept the full-object shape that
 *   some example payloads document:
 *
 *     {
 *       "category": {
 *         "id": "mens",
 *         "name": "Men",
 *         "url": "/mens",
 *         "imageURL": "https://..."
 *       }
 *     }
 *
 *   In that case we render directly, no extra SCAPI roundtrip required.
 *
 * The component also accepts an optional `image` prop (a Page Designer image
 * asset attached on the tile in BM). If present, it overrides the SCAPI
 * category's own image — letting marketers pick a custom image per tile.
 *
 * Skip-render behaviour:
 *   - No `category` payload at all          → render `null`.
 *   - SCAPI lookup errored / returned null  → render `null`.
 *   - Category resolved but `online === false` → render `null` (handled by
 *     `<CategoryTile>`).
 */
export const FeaturedCategoryTile = ({category, image}) => {
    const isObjectShape = category && typeof category === 'object'
    const categoryId = isObjectShape ? category.id : category

    // Only fetch from SCAPI when we have just an id; skip the request when
    // the marketer has somehow embedded the full category inline.
    const {data: scapiCategory, isLoading, error} = useCategory(
        {parameters: {id: categoryId}},
        {
            enabled: Boolean(categoryId) && !isObjectShape,
            // Categories rarely change between page views; cache aggressively.
            staleTime: 5 * 60 * 1000
        }
    )

    if (!category) return null

    if (isObjectShape) {
        return <CategoryTile category={image ? {...category, image} : category} />
    }

    if (isLoading) {
        return (
            <Box>
                <Skeleton borderRadius="md" height={{base: '160px', md: '220px'}} />
                <Skeleton marginTop={2} height="14px" width="60%" mx="auto" />
            </Box>
        )
    }

    if (error || !scapiCategory) return null

    const merged = image ? {...scapiCategory, image} : scapiCategory

    return <CategoryTile category={merged} />
}

FeaturedCategoryTile.displayName = 'FeaturedCategoryTile'

FeaturedCategoryTile.propTypes = {
    // SCAPI Page Designer typically returns the category attribute as a
    // string (id reference). We also accept a full object for forward-compat.
    category: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({
            id: PropTypes.string,
            name: PropTypes.string,
            url: PropTypes.string,
            imageURL: PropTypes.string,
            online: PropTypes.bool
        })
    ]),
    image: PropTypes.shape({
        url: PropTypes.string,
        alt: PropTypes.string,
        src: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.shape({
                mobile: PropTypes.string,
                tablet: PropTypes.string,
                desktop: PropTypes.string
            })
        ])
    })
}

export default FeaturedCategoryTile
