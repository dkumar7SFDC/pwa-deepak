/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Parses a value into a millisecond timestamp.
 * Returns `null` if the value is missing or not a valid date.
 *
 * @param {string | number | Date | undefined | null} value
 * @returns {number | null}
 */
const toTimestamp = (value) => {
    if (value === undefined || value === null || value === '') return null
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : null
}

/**
 * Returns a copy of the given basket product line items sorted in descending order
 * by when they were added/last modified - i.e. the most recently added item first.
 *
 * The SCAPI Shopper Baskets `ProductItem` schema does not guarantee a single timestamp
 * field, so we apply the following fallback chain:
 *   1. `creationDate`        - if the basket exposes a creation timestamp.
 *   2. `c_creationDate`      - common custom-attribute name for a creation timestamp.
 *   3. `lastModified`        - last-mutation timestamp (also catches quantity updates).
 *   4. `position`            - integer ordering field (higher = added later).
 *   5. Original array order  - newest items are appended last, so reversing keeps
 *                              "recently added first" behavior.
 *
 * The sort is stable for items that compare equal by always falling back to the
 * reversed insertion order as a final tie-breaker, ensuring deterministic output.
 *
 * @param {Array<object> | undefined | null} items - basket.productItems
 * @returns {Array<object>} new array sorted newest-first
 */
export const sortBasketItemsByRecency = (items) => {
    if (!Array.isArray(items) || items.length === 0) return []

    const indexed = items.map((item, originalIndex) => ({item, originalIndex}))

    indexed.sort((a, b) => {
        const aCreation = toTimestamp(a.item?.creationDate ?? a.item?.c_creationDate)
        const bCreation = toTimestamp(b.item?.creationDate ?? b.item?.c_creationDate)
        if (aCreation !== null && bCreation !== null && aCreation !== bCreation) {
            return bCreation - aCreation
        }

        const aModified = toTimestamp(a.item?.lastModified)
        const bModified = toTimestamp(b.item?.lastModified)
        if (aModified !== null && bModified !== null && aModified !== bModified) {
            return bModified - aModified
        }

        const aPosition = typeof a.item?.position === 'number' ? a.item.position : null
        const bPosition = typeof b.item?.position === 'number' ? b.item.position : null
        if (aPosition !== null && bPosition !== null && aPosition !== bPosition) {
            return bPosition - aPosition
        }

        return b.originalIndex - a.originalIndex
    })

    return indexed.map(({item}) => item)
}
