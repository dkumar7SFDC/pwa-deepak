/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React, {useEffect, useMemo} from 'react'
import PropTypes from 'prop-types'

import {usePage} from '@salesforce/commerce-sdk-react'
import {Page} from '@salesforce/commerce-sdk-react/page-designer'

// UI primitives
import {Box, Skeleton, Stack, Text} from '@salesforce/retail-react-app/app/components/shared/ui'

// Page Designer components (already registered in app/page-designer/registry.js
// and re-exported from these barrels). Kept in one map so adding a new component
// type only takes one entry here AND a registry entry.
import {
    ImageWithText,
    ImageTile,
    MainBanner,
    FeaturedCategoryTile
} from '@salesforce/retail-react-app/app/page-designer/assets'
import {
    MobileGrid1r1c,
    MobileGrid2r1c,
    MobileGrid2r2c,
    MobileGrid2r3c,
    MobileGrid3r1c,
    MobileGrid3r2c
} from '@salesforce/retail-react-app/app/page-designer/layouts'
import FeaturedCategoryGrid from '@salesforce/retail-react-app/app/components/page-designer/category-grid'

import {isServer} from '@salesforce/retail-react-app/app/utils/utils'

const COMPONENT_MAP = {
    'commerce_assets.imageAndText': ImageWithText,
    'commerce_assets.imageTile': ImageTile,
    'commerce_assets.productTile': ImageWithText,
    'commerce_assets.productListTile': ImageWithText,
    'commerce_assets.mainBanner': MainBanner,
    // The category tile is registered in BM as `commerce_assets.categoryTile`.
    // We also accept a few spelling/casing variants as aliases for safety.
    'commerce_assets.categoryTile': FeaturedCategoryTile,
    'commerce_assets.categorytile': FeaturedCategoryTile,
    'commerce_assets.featuredcategorytile': FeaturedCategoryTile,
    'commerce_assets.featuredCategoryTile': FeaturedCategoryTile,
    'commerce_layouts.mobileGrid1r1c': MobileGrid1r1c,
    'commerce_layouts.mobileGrid2r1c': MobileGrid2r1c,
    'commerce_layouts.mobileGrid2r2c': MobileGrid2r2c,
    'commerce_layouts.mobileGrid2r3c': MobileGrid2r3c,
    'commerce_layouts.mobileGrid3r1c': MobileGrid3r1c,
    'commerce_layouts.mobileGrid3r2c': MobileGrid3r2c,
    // BM uses the lowercase id `featuredcategorygrid` for the layout. The
    // camelCase variant is kept as an alias.
    'commerce_layouts.featuredcategorygrid': FeaturedCategoryGrid,
    'commerce_layouts.featuredCategoryGrid': FeaturedCategoryGrid
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
 * @param {('default'|'grid')} [layout='default'] - When set to "grid", the
 *   SDK's `.container` element (which holds the region's children as direct
 *   siblings) is styled as a responsive 2-col mobile / 4-col desktop CSS grid.
 *   Use this when the marketer drops asset tiles directly into a region
 *   (no layout component wrapping them) and you still want a grid layout.
 * @param {boolean} [debug=false] - When true, surfaces in-page diagnostics
 *   (HTTP error, missing region, unmapped type ids, etc.) and logs the raw
 *   SCAPI page payload to the console. INTENDED FOR DEVELOPMENT ONLY — leave
 *   off in production so non-targeted shoppers continue to see nothing.
 */
const PageDesignerMainRegion = ({
    pageId,
    regionId = DEFAULT_REGION_ID,
    components = COMPONENT_MAP,
    layout = 'default',
    debug = false,
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

    // Walk every region/component recursively and collect any typeIds that
    // aren't in the component map. PD components nest inside layout `regions`,
    // so we recurse to catch tiles that live inside e.g. mobileGrid layouts.
    const unmappedTypeIds = useMemo(() => {
        if (!page?.regions) return []
        const found = new Set()
        const walk = (component) => {
            if (!component) return
            if (component.typeId && !components[component.typeId]) {
                found.add(component.typeId)
            }
            ;(component.regions || []).forEach((r) => {
                ;(r.components || []).forEach(walk)
            })
        }
        page.regions.forEach((r) => (r.components || []).forEach(walk))
        return [...found]
    }, [page, components])

    // Dev-only: log the raw SCAPI payload + any missing component mappings so
    // marketers/developers can pinpoint why a region renders empty. Disabled
    // in production unless `debug` is explicitly passed.
    useEffect(() => {
        if (!debug) return
        // eslint-disable-next-line no-console
        console.groupCollapsed(`[PageDesignerMainRegion] pageId="${pageId}"`)
        // eslint-disable-next-line no-console
        console.log('error:', error)
        // eslint-disable-next-line no-console
        console.log('isFetching:', isFetching)
        // eslint-disable-next-line no-console
        console.log('raw page payload:', page)
        if (unmappedTypeIds.length) {
            // eslint-disable-next-line no-console
            console.warn(
                'Unmapped Page Designer typeIds (no React component registered):',
                unmappedTypeIds
            )
        }
        // eslint-disable-next-line no-console
        console.groupEnd()
    }, [debug, error, isFetching, page, pageId, unmappedTypeIds])

    // Silent fallback covers: SCAPI 404 (shopper not targeted), the requested
    // region missing, or the region having zero components. This satisfies the
    // "non-targeted shoppers see nothing" requirement without any client-side
    // group inspection. When `debug` is true we instead render a clearly
    // labelled diagnostic box so developers can see what's wrong.
    if (error) {
        if (!debug) return null
        return (
            <DebugMessage
                pageId={pageId}
                title={`SCAPI error fetching page "${pageId}"`}
                detail={error?.message || String(error)}
                hint="Check the Network tab for the /shopper-experience/.../pages/<pageId> request. A 404 means the page isn't published, doesn't exist, or the shopper isn't in a targeted customer group."
                {...rest}
            />
        )
    }

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

    if (!scopedPage) {
        if (!debug) return null

        // Build a precise reason so the developer knows exactly what to fix.
        let reason
        let hint
        if (!page) {
            reason = `SCAPI returned no page for pageId="${pageId}".`
            hint =
                'Create and publish a Page Designer page with this id in Business Manager, then assign the active site/customer group.'
        } else if (!page.regions || page.regions.length === 0) {
            reason = `Page "${pageId}" has no regions.`
            hint = 'Open the page in Page Designer and add components to a region.'
        } else if (!page.regions.find((r) => r.id === regionId)) {
            reason = `Page "${pageId}" has regions [${page.regions
                .map((r) => `"${r.id}"`)
                .join(', ')}] but no region "${regionId}".`
            hint = `Either rename the region in BM to "${regionId}" or pass regionId="<your region id>" to <PageDesignerMainRegion />.`
        } else {
            reason = `Region "${regionId}" on page "${pageId}" is empty.`
            hint = 'Drop at least one component into the region in Page Designer.'
        }

        return <DebugMessage pageId={pageId} title="No content to render" detail={reason} hint={hint} {...rest} />
    }

    // CSS grid styling for the SDK's `.container` div when layout="grid".
    // The SDK renders `<div className="page"><div className="container">{children}</div></div>`
    // and the SDK's <Region> uses a Fragment (no wrapper) on the client, so
    // tile components end up as direct children of `.container`. Targeting
    // the container directly via `sx` is the simplest reliable hook.
    const gridSx =
        layout === 'grid'
            ? {
                  '.page > .container': {
                      display: 'grid',
                      gridTemplateColumns: {
                          base: 'repeat(2, minmax(0, 1fr))',
                          md: 'repeat(4, minmax(0, 1fr))'
                      },
                      gap: {base: 3, md: 6},
                      paddingX: {base: 2, md: 0}
                  },
                  // The SDK's <Component> wraps each child in a <div> during
                  // SSR. Make those wrappers grid items themselves so layout
                  // is identical pre- and post-hydration.
                  '.page > .container > div': {
                      width: '100%'
                  }
              }
            : undefined

    return (
        <Box {...rest} data-testid={`pd-main-region-${pageId}`} sx={gridSx}>
            {debug && unmappedTypeIds.length > 0 && (
                <DebugMessage
                    pageId={pageId}
                    title="Unmapped Page Designer component type ids"
                    detail={`The following typeIds appear in the SCAPI payload but have no React component registered, so they render as empty <div>s: ${unmappedTypeIds
                        .map((t) => `"${t}"`)
                        .join(', ')}.`}
                    hint="Add an entry for each unmapped typeId to COMPONENT_MAP in app/components/page-designer-main-region/index.jsx (and the matching importer in app/page-designer/registry.js)."
                    marginBottom={4}
                />
            )}
            <Page page={scopedPage} components={components} />
        </Box>
    )
}

/**
 * Inline diagnostic box. Only mounted when `debug` is enabled on the parent.
 */
const DebugMessage = ({pageId, title, detail, hint, ...rest}) => (
    <Box
        {...rest}
        data-testid={`pd-main-region-${pageId}-debug`}
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="orange.400"
        borderRadius="md"
        background="orange.50"
        padding={4}
    >
        <Text fontWeight="bold" color="orange.700" marginBottom={1}>
            Page Designer · {title}
        </Text>
        <Text fontSize="sm" color="gray.800" marginBottom={2}>
            {detail}
        </Text>
        <Text fontSize="sm" color="gray.700">
            {hint}
        </Text>
        <Text fontSize="xs" color="gray.500" marginTop={2}>
            (Open the browser console for the full SCAPI payload. This box only
            renders when{' '}
            <Text
                as="span"
                fontFamily="mono"
                fontSize="xs"
                background="orange.100"
                paddingX={1}
                borderRadius="sm"
            >
                debug
            </Text>{' '}
            is enabled.)
        </Text>
    </Box>
)

DebugMessage.propTypes = {
    pageId: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    detail: PropTypes.string.isRequired,
    hint: PropTypes.string.isRequired
}

PageDesignerMainRegion.propTypes = {
    pageId: PropTypes.string.isRequired,
    regionId: PropTypes.string,
    components: PropTypes.object,
    layout: PropTypes.oneOf(['default', 'grid']),
    debug: PropTypes.bool
}

export default PageDesignerMainRegion
