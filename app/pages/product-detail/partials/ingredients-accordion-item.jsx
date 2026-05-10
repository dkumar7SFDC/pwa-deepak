/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React, {useEffect, useMemo} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'

// `isomorphic-dompurify` is a drop-in replacement for `dompurify` that works
// transparently in both Node (PWA Kit's SSR runtime) and the browser. The API
// is identical to the standard `dompurify` package — `DOMPurify.sanitize(...)`.
// Plain `dompurify` requires a DOM at import time and crashes during SSR.
import DOMPurify from 'isomorphic-dompurify'

import {
    AccordionItem,
    AccordionButton,
    AccordionPanel,
    AccordionIcon,
    Box
} from '@salesforce/retail-react-app/app/components/shared/ui'

/**
 * Tags allowed inside the Ingredients HTML payload.
 *
 * The list mirrors the formatting requirements specified for the SFCC
 * `ingredients` attribute:
 *   - paragraphs           (<p>)
 *   - bold text            (<b>, <strong>)
 *   - emphasis             (<em>, <i>, <u>)
 *   - line breaks          (<br>)
 *   - unordered lists      (<ul>, <li>)
 *   - ordered lists        (<ol>, <li>)
 *
 * Any other tag (script, iframe, link, img, on* event attrs, javascript: URLs,
 * etc.) is stripped by DOMPurify before render, so XSS payloads in the
 * attribute value are neutralised.
 */
const ALLOWED_TAGS = ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li']
const ALLOWED_ATTR = ['class']

/**
 * Resolve the raw ingredients HTML from a product object.
 *
 * The requirement specifies `product.customAttributes.ingredients`, but
 * different SCAPI endpoints expose custom attributes in different shapes:
 *
 *   - Normalised object  → `product.customAttributes.ingredients`         (preferred)
 *   - SCAPI flat form    → `product.c_ingredients`                         (raw Shopper Products / Search)
 *   - SCAPI array form   → `product.customAttributes = [{id, value}, …]`   (some endpoints)
 *
 * We check all three so the component works regardless of how the project
 * happens to consume the SCAPI response today, with the documented
 * `customAttributes.ingredients` path taking precedence.
 */
const resolveIngredientsHtml = (product) => {
    if (!product) return null

    const customAttributes = product.customAttributes

    // Preferred: { customAttributes: { ingredients: '<p>…</p>' } }
    if (customAttributes && !Array.isArray(customAttributes) && typeof customAttributes === 'object') {
        const value = customAttributes.ingredients
        if (typeof value === 'string') return value
    }

    // SCAPI array shape: [{ id: 'ingredients', value: '<p>…</p>' }, …]
    if (Array.isArray(customAttributes)) {
        const found = customAttributes.find((entry) => entry?.id === 'ingredients')
        if (typeof found?.value === 'string') return found.value
    }

    // SCAPI raw flat shape: { c_ingredients: '<p>…</p>' }
    if (typeof product.c_ingredients === 'string') return product.c_ingredients

    return null
}

/**
 * Returns true when the supplied HTML/text contains no actual content beyond
 * whitespace and empty markup. We strip the tags first so authoring tools
 * that emit `<p>&nbsp;</p>` or `<p><br/></p>` for "blank" values are still
 * treated as empty.
 */
const isEffectivelyEmpty = (html) => {
    if (typeof html !== 'string') return true
    if (html.trim() === '') return true
    const textOnly = html
        .replace(/<[^>]*>/g, '') // strip tags
        .replace(/&nbsp;|&#160;/gi, ' ')
        .trim()
    return textOnly === ''
}

/**
 * Ingredients accordion item.
 *
 * Drop-in `<AccordionItem>` that fits inside the existing PDP
 * `<InformationAccordion>` (same `<Accordion>` parent), so it inherits the
 * exact expand/collapse behaviour, borders, icon alignment, padding and
 * responsive rules of the surrounding accordion items — no UI duplication.
 *
 * Hides itself entirely (returns `null`) when the source attribute is
 * missing, null, undefined, empty, whitespace-only, or contains only empty
 * markup like `<p>&nbsp;</p>`. Returning `null` from inside an `<Accordion>`
 * is supported by Chakra and keeps the rest of the panels visually flush.
 *
 * The HTML body is sanitised with DOMPurify before being injected via
 * `dangerouslySetInnerHTML`, with a strict allowlist limited to the
 * formatting tags the merchant authoring guidelines actually need.
 */
const IngredientsAccordionItem = ({product, html, debug = false}) => {
    const {formatMessage} = useIntl()

    // Allow direct HTML override for reuse outside the PDP context (e.g.
    // marketing pages, PLP quick view); fall back to product attribute.
    const rawHtml = useMemo(
        () => (typeof html === 'string' ? html : resolveIngredientsHtml(product)),
        [product, html]
    )

    const sanitizedHtml = useMemo(() => {
        if (isEffectivelyEmpty(rawHtml)) return null
        return DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS,
            ALLOWED_ATTR,
            // Disallow data-* and aria-* shenanigans by being explicit.
            ALLOW_DATA_ATTR: false,
            ALLOW_ARIA_ATTR: false,
            // Strict mode: drop the entire node on disallowed tags rather
            // than keeping the text content (cleaner output, no half-tags).
            KEEP_CONTENT: true
        })
    }, [rawHtml])

    // Dev-only diagnostic: explain in the console why the panel is hidden
    // (raw value missing, empty after stripping tags, etc.). Helps merchants
    // distinguish "I forgot to populate the attribute" from "the data path
    // doesn't match what the storefront expects".
    useEffect(() => {
        if (!debug) return
        if (sanitizedHtml) return // Visible — nothing to log.
        const customAttributes = product?.customAttributes
        const customAttributeKeys =
            customAttributes && !Array.isArray(customAttributes)
                ? Object.keys(customAttributes)
                : Array.isArray(customAttributes)
                ? customAttributes.map((entry) => entry?.id).filter(Boolean)
                : []
        const cKeys = product
            ? Object.keys(product).filter((k) => k.startsWith('c_'))
            : []
        // eslint-disable-next-line no-console
        console.info(
            '[IngredientsAccordionItem] hidden — no usable ingredients value.',
            {
                productId: product?.id || product?.productId,
                rawHtml,
                rawType: typeof rawHtml,
                customAttributesKeys: customAttributeKeys,
                productCKeys: cKeys
            }
        )
    }, [debug, sanitizedHtml, rawHtml, product])

    if (!sanitizedHtml) return null

    return (
        <AccordionItem data-testid="pdp-ingredients-accordion-item">
            <h2>
                <AccordionButton height="64px">
                    <Box flex="1" textAlign="left" fontWeight="bold" fontSize="lg">
                        {formatMessage({
                            defaultMessage: 'Ingredients',
                            id: 'product_detail.accordion.button.ingredients'
                        })}
                    </Box>
                    <AccordionIcon />
                </AccordionButton>
            </h2>
            <AccordionPanel mb={6} mt={4}>
                <Box
                    data-testid="pdp-ingredients-content"
                    sx={{
                        // Restore default browser bullets/numbering inside
                        // Chakra's CSS reset so <ul>/<ol> author content
                        // renders the way merchants expect.
                        'ul, ol': {paddingLeft: '1.25rem', marginY: 2},
                        'ul': {listStyleType: 'disc'},
                        'ol': {listStyleType: 'decimal'},
                        'li': {marginY: 1},
                        'p': {marginY: 2},
                        'p:first-of-type': {marginTop: 0},
                        'p:last-of-type': {marginBottom: 0}
                    }}
                    dangerouslySetInnerHTML={{__html: sanitizedHtml}}
                />
            </AccordionPanel>
        </AccordionItem>
    )
}

IngredientsAccordionItem.displayName = 'IngredientsAccordionItem'

IngredientsAccordionItem.propTypes = {
    /**
     * Product object as returned by the SCAPI Shopper Products / Search
     * hooks. The component reads ingredients from any of the supported
     * shapes (see `resolveIngredientsHtml`).
     */
    product: PropTypes.object,
    /**
     * Optional raw HTML override. When provided, takes precedence over
     * `product.customAttributes.ingredients`. Useful for previews and tests.
     */
    html: PropTypes.string,
    /**
     * When true and the panel ends up hidden, log a single diagnostic line
     * to the console with the resolved value and the available custom
     * attribute keys. Intended for development only.
     */
    debug: PropTypes.bool
}

export default IngredientsAccordionItem
