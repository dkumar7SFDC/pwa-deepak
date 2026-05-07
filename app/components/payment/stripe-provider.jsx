/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useMemo} from 'react'
import PropTypes from 'prop-types'
import {Elements} from '@stripe/react-stripe-js'
import {loadStripe} from '@stripe/stripe-js'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

/**
 * Cache the `loadStripe` promise per publishable key so we never load the
 * Stripe SDK more than once for a given key. `loadStripe` is no-op safe on
 * the server because it returns a Promise that's only resolved on the client,
 * but we still guard against rebuilding the promise on every render.
 */
const stripePromiseCache = new Map()

const getStripePromise = (publishableKey) => {
    if (!publishableKey) return null
    if (!stripePromiseCache.has(publishableKey)) {
        stripePromiseCache.set(publishableKey, loadStripe(publishableKey))
    }
    return stripePromiseCache.get(publishableKey)
}

/**
 * Returns the Stripe publishable key from PWA Kit's serialized SSR config.
 * Returns an empty string when not configured, in which case Stripe should be
 * disabled and the storefront should fall back to its non-Stripe payment flow.
 */
export const getStripePublishableKey = () => {
    return getConfig()?.app?.stripe?.publishableKey || ''
}

/**
 * Convenience flag for downstream code (checkout pages, payment step) to know
 * whether Stripe-based payment is available without depending on this file
 * directly.
 */
export const isStripeEnabled = () => Boolean(getStripePublishableKey())

/**
 * Wraps children in a Stripe `<Elements>` provider so descendant components
 * can use Stripe Elements (e.g. `<CardElement>`) and the `useStripe` /
 * `useElements` hooks for client-side tokenization.
 *
 * Render this provider only on routes that actually need Stripe (e.g.
 * checkout) so the Stripe.js SDK isn't downloaded on every page load.
 *
 * IMPORTANT: `<Elements>` is rendered unconditionally even when no
 * publishable key is configured. We pass `stripe={null}` in that case —
 * Stripe explicitly supports this as the lazy-loading pattern, and it
 * causes `useStripe()` / `useElements()` to return `null` instead of
 * throwing "Could not find Elements context" in any descendant. This lets
 * the storefront render the legacy (non-Stripe) payment fallback safely
 * even when Stripe is disabled.
 */
const StripeProvider = ({children, options}) => {
    const publishableKey = getStripePublishableKey()
    const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey])

    return (
        <Elements stripe={stripePromise} options={options}>
            {children}
        </Elements>
    )
}

StripeProvider.propTypes = {
    children: PropTypes.node,
    /**
     * Optional options forwarded to `<Elements>` (locale, fonts, appearance,
     * clientSecret for PaymentIntent flows, etc.).
     */
    options: PropTypes.object
}

export default StripeProvider
