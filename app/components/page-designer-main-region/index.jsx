/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React, {useMemo} from 'react'
import PropTypes from 'prop-types'

import {usePage} from '@salesforce/commerce-sdk-react'
import {Page} from '@salesforce/commerce-sdk-react/page-designer'

// UI primitives
import {Box, Skeleton, Stack} from '@salesforce/retail-react-app/app/components/shared/ui'

// Page Designer components (already registered in app/page-designer/registry.js
// and re-exported from these barrels). Kept in one map so adding a new component
// type only takes one entry here AND a registry entry.
import {
    ImageWithText,
    ImageTile,
    MainBanner
} from '@salesforce/retail-react-app/app/page-designer/assets'
import {
    MobileGrid1r1c,
    MobileGrid2r1c,
    MobileGrid2r2c,
    MobileGrid2r3c,
    MobileGrid3r1c,
    MobileGrid3r2c
} from '@salesforce/retail-react-app/app/page-designer/layouts'

import {isServer} from '@salesforce/retail-react-app/app/utils/utils'

const COMPONENT_MAP = {
    'commerce_assets.imageAndText': ImageWithText,
    'commerce_assets.imageTile': ImageTile,
    'commerce_assets.productTile': ImageWithText,
    'commerce_assets.productListTile': ImageWithText,
    'commerce_assets.mainBanner': MainBanner,
    'commerce_layouts.mobileGrid1r1c': MobileGrid1r1c,
    'commerce_layouts.mobileGrid2r1c': MobileGrid2r1c,
    'commerce_layouts.mobileGrid2r2c': MobileGrid2r2c,
    'commerce_layouts.mobileGrid2r3c': MobileGrid2r3c,
    'commerce_layouts.mobileGrid3r1c': MobileGrid3r1c,
    'commerce_layouts.mobileGrid3r2c': MobileGrid3r2c
}

const DEFAULT_REGION_ID = 'main'

/**
 * Renders a single region of a Page Designer page fetched via the SCAPI
 * Shopper Experience API. Auth (bearer token) and customer-group personalization
 * are handled entirely by SCAPI — this component does NOT inspect the
 * customer's group; if the shopper isn't targeted, SCAPI returns a 404 / empty
 * page and we silently render nothing.
 *
 * @param {string} pageId      - SCAPI Page Designer page id (e.g. "banner")
 * @param {string} [regionId]  - Region to render. Defaults to "main".
 * @param {object} [components] - Optional override for the component-type map.
 */
const PageDesignerMainRegion = ({
    pageId,
    regionId = DEFAULT_REGION_ID,
    components = COMPONENT_MAP,
    ...rest
}) => {
    // Customer-group membership is carried in the SLAS access token, which
    // commerce-sdk-react injects on every SCAPI request, so the page query is
    // safe to enable as soon as we're on the client. We deliberately don't
    // gate on Shopper Context — that only applies to tenants which set
    // additional personalization context (priceList, sourceCode, etc.) and
    // would block the fetch indefinitely otherwise.
    const isPageQueryEnabled = !isServer
    const {data: page, isFetching, error} = usePage(
        {parameters: {pageId}},
        {enabled: isPageQueryEnabled, staleTime: 5 * 60 * 1000}
    )

    // Reduce the SCAPI page payload to the requested region only. SCAPI may
    // return multiple regions (header/main/footer/etc.); we want exactly one.
    const scopedPage = useMemo(() => {
        if (!page?.regions) return null
        const region = page.regions.find((r) => r.id === regionId)
        if (!region || !region.components || region.components.length === 0) {
            return null
        }
        return {...page, regions: [region]}
    }, [page, regionId])

    // Silent fallback covers: SCAPI 404 (shopper not targeted), the requested
    // region missing, or the region having zero components. This satisfies the
    // "non-targeted shoppers see nothing" requirement without any client-side
    // group inspection.
    if (error) return null

    // Show the skeleton ONLY while the page query is actually running for the
    // first time. We must not gate on `isLoading` here: in React Query v4 a
    // disabled query reports `isLoading: true` even though no fetch is in
    // flight, which would leave the skeleton on screen forever for shoppers
    // whose `shopperContext` never resolves.
    if (isPageQueryEnabled && isFetching && !scopedPage) {
        return (
            <Box {...rest} data-testid={`pd-main-region-${pageId}-loading`}>
                <Stack spacing={3}>
                    <Skeleton height="180px" borderRadius="md" />
                </Stack>
            </Box>
        )
    }

    if (!scopedPage) return null

    return (
        <Box {...rest} data-testid={`pd-main-region-${pageId}`}>
            <Page page={scopedPage} components={components} />
        </Box>
    )
}

PageDesignerMainRegion.propTypes = {
    pageId: PropTypes.string.isRequired,
    regionId: PropTypes.string,
    components: PropTypes.object
}

export default PageDesignerMainRegion
