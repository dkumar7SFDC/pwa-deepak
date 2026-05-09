/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React from 'react'
import PropTypes from 'prop-types'

import {SimpleGrid} from '@salesforce/retail-react-app/app/components/shared/ui'
import {Region, regionPropType} from '@salesforce/commerce-sdk-react/page-designer'

/**
 * Page Designer layout component that arranges its child Featured Category
 * Tiles in a responsive grid:
 *
 *   • mobile  →  2 columns
 *   • desktop →  4 columns
 *
 * Component type id (must match the id configured in Business Manager):
 *   `commerce_layouts.featuredCategoryGrid`
 *
 * The marketer drops one or more "Featured Category Tile" components inside
 * the regions of this layout in BM. The SDK's `<Region>` renderer then mounts
 * each child via the type → component map registered in
 * `app/components/page-designer-main-region`.
 *
 * Spacing values match the existing `MobileGrid*` layouts so the new layout
 * blends in with the rest of the storefront's Page Designer presets.
 */
export const FeaturedCategoryGrid = ({regions, component}) => (
    <SimpleGrid
        className="featured-category-grid"
        columns={{base: 2, md: 4}}
        spacingX={{base: 3, md: 6}}
        spacingY={{base: 4, md: 8}}
        paddingX={{base: 2, md: 0}}
        data-testid="pd-featured-category-grid"
    >
        {regions.map((region) => (
            <Region key={region.id} component={component} regionId={region.id} />
        ))}
    </SimpleGrid>
)

FeaturedCategoryGrid.displayName = 'FeaturedCategoryGrid'

FeaturedCategoryGrid.propTypes = {
    // Both props are injected by the Page Designer SDK's <Component> renderer.
    regions: PropTypes.arrayOf(regionPropType).isRequired,
    component: PropTypes.object.isRequired
}

export default FeaturedCategoryGrid
