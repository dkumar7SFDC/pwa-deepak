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
    Image,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import Link from '@salesforce/retail-react-app/app/components/link'

/**
 * Renders a Page Designer `commerce_assets.mainBanner` component.
 *
 * Data shape produced by SCAPI for this typeId:
 *   {
 *     image:        { url, focalPoint: {x,y}, metaData: {width,height} },
 *     heading:      "<p>...</p>"  // sanitized HTML
 *     categoryLink: "womens"      // category id → routes to /category/<id>
 *   }
 *
 * The heading is rendered as overlay text on top of the image. The whole
 * banner is wrapped in a router-aware `Link` whenever a categoryLink is
 * provided, so PWA Kit's locale/site routing kicks in automatically.
 */
export const MainBanner = ({image, heading, categoryLink}) => {
    if (!image?.url) return null

    const focalX = image?.focalPoint?.x ?? 0.5
    const focalY = image?.focalPoint?.y ?? 0.5
    const aspect =
        image?.metaData?.width && image?.metaData?.height
            ? image.metaData.width / image.metaData.height
            : 16 / 9

    const banner = (
        <Box
            position="relative"
            overflow="hidden"
            borderRadius="md"
            data-testid="pd-main-banner"
        >
            <AspectRatio ratio={aspect} maxHeight={{base: 320, md: 480, lg: 560}}>
                <Image
                    src={image.url}
                    alt={image.alt || ''}
                    objectFit="cover"
                    objectPosition={`${focalX * 100}% ${focalY * 100}%`}
                    width="100%"
                    height="100%"
                    ignoreFallback
                    filter={heading ? 'brightness(60%)' : undefined}
                />
            </AspectRatio>

            {heading && (
                <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    width="100%"
                    paddingX={{base: 4, md: 8}}
                    textAlign="center"
                    pointerEvents="none"
                >
                    <Text as="span" color="white" fontWeight="bold">
                        {/* SCAPI returns sanitized HTML; safe to inject. */}
                        <Box
                            dangerouslySetInnerHTML={{__html: heading}}
                            sx={{
                                ['h1, h2, h3, h4, h5, h6, p']: {
                                    fontSize: {base: '2xl', md: '4xl', lg: '5xl'},
                                    fontWeight: 'bold',
                                    margin: 0
                                }
                            }}
                        />
                    </Text>
                </Box>
            )}
        </Box>
    )

    if (!categoryLink) return banner

    return (
        <Link
            to={`/category/${categoryLink}`}
            _hover={{textDecoration: 'none'}}
            aria-label={image?.alt || categoryLink}
        >
            {banner}
        </Link>
    )
}

MainBanner.propTypes = {
    image: PropTypes.shape({
        url: PropTypes.string,
        alt: PropTypes.string,
        focalPoint: PropTypes.shape({
            x: PropTypes.number,
            y: PropTypes.number
        }),
        metaData: PropTypes.shape({
            width: PropTypes.number,
            height: PropTypes.number
        })
    }),
    heading: PropTypes.string,
    categoryLink: PropTypes.string
}

export default MainBanner
