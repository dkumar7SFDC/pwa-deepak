/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React from 'react'
import PropTypes from 'prop-types'

import {
    AspectRatio,
    Box,
    Flex,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'
import DynamicImage from '@salesforce/retail-react-app/app/components/dynamic-image'
import {isAbsoluteURL} from '@salesforce/retail-react-app/app/page-designer/utils'

import './category-tile.css'

/**
 * Build a category PLP URL from the data SCAPI / Page Designer returns.
 *
 *  - If the marketer entered a fully-qualified absolute URL ("https://..."), use it.
 *  - If the marketer entered a relative path beginning with "/", trust it and leave
 *    URL building to PWA Kit's `<Link>` (which prepends the locale/site prefix).
 *  - Otherwise fall back to `/category/<id>`, the convention already used elsewhere
 *    in this project (see `app/page-designer/assets/main-banner`).
 */
const resolveCategoryHref = ({id, url}) => {
    if (typeof url === 'string' && url.trim() !== '') return url
    if (id) return `/category/${id}`
    return null
}

/**
 * Pick the best image URL out of the multiple shapes a category record can take.
 *
 *  1. SCAPI Category schema → `image` is a plain URL string.
 *  2. Page Designer image asset → `image` is `{ url, alt, src: { mobile, tablet, desktop } }`.
 *  3. Marketer-supplied URL on the BM tile attribute → `imageURL`.
 *  4. SCAPI also exposes a smaller `thumbnail` URL on Category — useful as a last resort.
 *
 * Returns `null` when no usable image is available (the caller renders a fallback
 * placeholder in that case).
 */
const resolveImageSrc = ({imageURL, image, thumbnail}) => {
    if (imageURL) return imageURL
    if (typeof image === 'string') return image
    if (image && typeof image === 'object') {
        return image.src?.mobile || image.src?.desktop || image.src?.tablet || image.url || null
    }
    return thumbnail || null
}

/**
 * Reusable Featured Category Tile.
 *
 * The visual styling is intentionally aligned with the project's `ProductTile`
 * (square 1:1 image, no shadow, bold centered title) so the home page reads as
 * one consistent merchandising shelf.
 *
 * Image delivery uses `<DynamicImage>` — the project's CDN-aware responsive
 * image component. It generates a `<picture>` with `<source>` elements for
 * each breakpoint and rewrites the URL through Salesforce's Dynamic Imaging
 * Service (`?sw={width}&q=60`) so we get a properly-sized payload at every
 * viewport. This is the PWA Kit equivalent of Next.js's `next/image`.
 *
 * Fallback strategy when category data is incomplete:
 *  - No `category` at all OR `category.online === false` → return `null` (skip render).
 *  - Image missing → render a branded text placeholder so the grid stays balanced.
 *
 * @param {object}   props
 * @param {object}   props.category               Category data from SCAPI / Page Designer.
 * @param {string}   props.category.id            Category id (used for fallback URL).
 * @param {string}   props.category.name          Display name shown under the tile.
 * @param {string}  [props.category.url]          Optional explicit URL.
 * @param {string}  [props.category.imageURL]     Primary image URL (mobile).
 * @param {(string|object)} [props.category.image] String URL (SCAPI) or PD image asset.
 * @param {string}  [props.category.thumbnail]    SCAPI Category fallback thumbnail.
 * @param {boolean} [props.category.online=true]  When `false`, the tile is skipped.
 * @param {string}  [props.placeholderSrc]        Override URL used when the category image is missing.
 * @param {(number[]|string[])} [props.widths]    Override DynamicImage widths.
 */
export const CategoryTile = ({category, placeholderSrc, widths}) => {
    if (!category) return null
    if (category.online === false) return null

    const {id, name} = category
    if (!id && !name) return null

    const accessibleName = name || id
    const href = resolveCategoryHref(category)
    const imageSrc = resolveImageSrc(category) || placeholderSrc || null

    // DynamicImage builds the `<picture>` srcSet from this list. Two breakpoints
    // worth of values is plenty for a 2/4-column grid on a Salesforce CDN.
    const dynamicWidths = widths || ['50vw', '50vw', '25vw', '25vw']

    const TileBody = (
        <Box position="relative" data-testid="category-tile" className="category-tile">
            <Box
                className="category-tile__media"
                position="relative"
                marginBottom={2}
                borderRadius="md"
                overflow="hidden"
                background="gray.50"
            >
                <AspectRatio ratio={1}>
                    {imageSrc ? (
                        <DynamicImage
                            data-testid="category-tile-image"
                            src={`${imageSrc}[?sw={width}&q=60]`}
                            widths={dynamicWidths}
                            imageProps={{
                                alt: accessibleName,
                                loading: 'lazy'
                            }}
                        />
                    ) : (
                        <Flex
                            className="category-tile__placeholder"
                            align="center"
                            justify="center"
                            padding={3}
                            background="linear-gradient(135deg, #eef0f3 0%, #dcdfe4 100%)"
                        >
                            <Text
                                fontSize={{base: 'sm', md: 'md'}}
                                fontWeight={600}
                                color="gray.500"
                                textTransform="uppercase"
                                letterSpacing="wider"
                                textAlign="center"
                                noOfLines={2}
                            >
                                {accessibleName}
                            </Text>
                        </Flex>
                    )}
                </AspectRatio>
            </Box>
            <Text
                as="h3"
                fontWeight={600}
                fontSize={{base: 'sm', md: 'md'}}
                color="gray.800"
                textAlign="center"
                noOfLines={2}
                margin={0}
            >
                {accessibleName}
            </Text>
        </Box>
    )

    if (!href) return TileBody

    const useRouterLink = !isAbsoluteURL(href)

    if (useRouterLink) {
        return (
            <Link
                to={href}
                aria-label={accessibleName}
                display="block"
                _hover={{textDecoration: 'none'}}
            >
                {TileBody}
            </Link>
        )
    }

    return (
        <Box
            as="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            display="block"
            aria-label={accessibleName}
            _hover={{textDecoration: 'none'}}
        >
            {TileBody}
        </Box>
    )
}

CategoryTile.displayName = 'CategoryTile'

CategoryTile.propTypes = {
    category: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        url: PropTypes.string,
        imageURL: PropTypes.string,
        // SCAPI returns `image` as a string URL on Category. Page Designer
        // assets, on the other hand, return image objects. Accept both.
        image: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.shape({
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
        ]),
        thumbnail: PropTypes.string,
        online: PropTypes.bool
    }),
    placeholderSrc: PropTypes.string,
    widths: PropTypes.oneOfType([PropTypes.array, PropTypes.object])
}

export default CategoryTile
