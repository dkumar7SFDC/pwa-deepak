/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {useCallback, useEffect, useState} from 'react'
import {isServer} from '@salesforce/retail-react-app/app/utils/utils'

export const USER_ZIP_STORAGE_KEY = 'userZip'
export const USER_ZIP_EVENT = 'userZip:change'

/**
 * Validates a 6-digit ZIP / postal code.
 * Empty string is treated as "valid" (no filter).
 * @param {string} zip
 * @returns {boolean}
 */
export const isValidZip = (zip) => {
    if (zip == null || zip === '') return true
    return /^\d{6}$/.test(String(zip).trim())
}

const readStoredZip = () => {
    if (isServer) return ''
    try {
        return window.localStorage.getItem(USER_ZIP_STORAGE_KEY) || ''
    } catch {
        // localStorage may be disabled (e.g. private mode); fall back to empty.
        return ''
    }
}

const writeStoredZip = (zip) => {
    if (isServer) return
    try {
        if (zip) {
            window.localStorage.setItem(USER_ZIP_STORAGE_KEY, zip)
        } else {
            window.localStorage.removeItem(USER_ZIP_STORAGE_KEY)
        }
        // Notify other consumers of this hook in the same tab.
        window.dispatchEvent(new CustomEvent(USER_ZIP_EVENT, {detail: {zip}}))
    } catch {
        // No-op when storage is unavailable.
    }
}

/**
 * Hook that manages a user-provided ZIP code persisted in localStorage.
 *
 * Returns a tuple of [zip, setZip, clearZip]. The state hydrates from
 * localStorage after the first client render to avoid SSR mismatches and stays
 * in sync across hook instances and tabs.
 */
export const useZipCode = () => {
    const [zip, setZipState] = useState('')

    useEffect(() => {
        setZipState(readStoredZip())

        const handleLocalChange = (event) => {
            setZipState(event?.detail?.zip ?? readStoredZip())
        }
        const handleStorage = (event) => {
            if (event.key === USER_ZIP_STORAGE_KEY) {
                setZipState(event.newValue || '')
            }
        }

        window.addEventListener(USER_ZIP_EVENT, handleLocalChange)
        window.addEventListener('storage', handleStorage)
        return () => {
            window.removeEventListener(USER_ZIP_EVENT, handleLocalChange)
            window.removeEventListener('storage', handleStorage)
        }
    }, [])

    const setZip = useCallback((next) => {
        const cleaned = (next ?? '').toString().trim()
        writeStoredZip(cleaned)
        setZipState(cleaned)
    }, [])

    const clearZip = useCallback(() => {
        writeStoredZip('')
        setZipState('')
    }, [])

    return [zip, setZip, clearZip]
}

export default useZipCode
