/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import React, {useEffect, useRef, useState} from 'react'
import PropTypes from 'prop-types'
import {defineMessage, FormattedMessage, useIntl} from 'react-intl'
import {
    Box,
    Button,
    Flex,
    FormControl,
    FormErrorMessage,
    FormLabel,
    Input,
    InputGroup,
    InputRightElement,
    Stack,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'

import {isValidZip} from '@salesforce/retail-react-app/app/hooks/use-zip-code'

const PLACEHOLDER = defineMessage({
    id: 'zip_code_filter.input.placeholder',
    defaultMessage: 'e.g. 110001'
})

/**
 * Renders a small, reusable ZIP-code filter UI:
 *   - Editable input that validates on blur / submit.
 *   - Debounced commit to the parent (avoids spamming the search API).
 *   - "Change" / "Clear" affordances once a ZIP is applied.
 *
 * The component is purely presentational; persistence is the caller's
 * concern (see `useZipCode`).
 */
const ZipCodeFilter = ({
    value = '',
    onChange,
    onClear,
    debounceMs = 500,
    isCompact = false,
    ...rest
}) => {
    const {formatMessage} = useIntl()
    const [draft, setDraft] = useState(value)
    const [isEditing, setIsEditing] = useState(!value)
    const [error, setError] = useState('')
    const debounceRef = useRef(null)

    useEffect(() => {
        setDraft(value)
        setIsEditing(!value)
    }, [value])

    useEffect(
        () => () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        },
        []
    )

    const commit = (next) => {
        const cleaned = (next ?? '').toString().trim()
        if (cleaned && !isValidZip(cleaned)) {
            setError(
                formatMessage({
                    id: 'zip_code_filter.error.invalid_format',
                    defaultMessage: 'Please enter a valid 6-digit ZIP code.'
                })
            )
            return false
        }
        setError('')
        onChange?.(cleaned)
        if (cleaned) setIsEditing(false)
        return true
    }

    const handleInputChange = (event) => {
        // Allow only digits; cap at 6 chars (6-digit postal code).
        const next = event.target.value.replace(/\D/g, '').slice(0, 6)
        setDraft(next)
        if (error) setError('')

        if (debounceRef.current) clearTimeout(debounceRef.current)
        // Only debounce-commit when fully formed (6 digits) to avoid
        // refetching on every keystroke while the user is still typing.
        if (next === '' || isValidZip(next)) {
            debounceRef.current = setTimeout(() => commit(next), debounceMs)
        }
    }

    const handleSubmit = (event) => {
        event.preventDefault()
        if (debounceRef.current) clearTimeout(debounceRef.current)
        commit(draft)
    }

    const handleClear = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setDraft('')
        setError('')
        setIsEditing(true)
        onClear?.()
    }

    if (!isEditing && value) {
        return (
            <Flex
                as="form"
                onSubmit={(e) => e.preventDefault()}
                align="center"
                gap={2}
                flexWrap="wrap"
                data-testid="sf-zip-code-filter-applied"
                {...rest}
            >
                <Text fontSize="sm" color="gray.700">
                    <FormattedMessage
                        id="zip_code_filter.label.shopping_in"
                        defaultMessage="Shopping in"
                    />{' '}
                    <Text as="span" fontWeight="bold">
                        {value}
                    </Text>
                </Text>
                <Button
                    size="sm"
                    variant="link"
                    colorScheme="blue"
                    onClick={() => setIsEditing(true)}
                    aria-label={formatMessage({
                        id: 'zip_code_filter.button.change_zip',
                        defaultMessage: 'Change ZIP code'
                    })}
                >
                    <FormattedMessage
                        id="zip_code_filter.button.change"
                        defaultMessage="Change"
                    />
                </Button>
                <Button
                    size="sm"
                    variant="link"
                    colorScheme="gray"
                    onClick={handleClear}
                    aria-label={formatMessage({
                        id: 'zip_code_filter.button.clear_zip',
                        defaultMessage: 'Clear ZIP code filter'
                    })}
                >
                    <FormattedMessage
                        id="zip_code_filter.button.clear"
                        defaultMessage="Clear"
                    />
                </Button>
            </Flex>
        )
    }

    return (
        <Box as="form" onSubmit={handleSubmit} {...rest}>
            <FormControl
                isInvalid={Boolean(error)}
                maxWidth={isCompact ? '220px' : '320px'}
            >
                <FormLabel
                    htmlFor="sf-zip-code-input"
                    fontSize="sm"
                    marginBottom={1}
                    fontWeight="medium"
                >
                    <FormattedMessage
                        id="zip_code_filter.label.input"
                        defaultMessage="Filter by ZIP code"
                    />
                </FormLabel>
                <Stack direction="row" spacing={2}>
                    <InputGroup size="md">
                        <Input
                            id="sf-zip-code-input"
                            data-testid="sf-zip-code-input"
                            type="text"
                            inputMode="numeric"
                            pattern="\d{6}"
                            maxLength={6}
                            autoComplete="postal-code"
                            placeholder={formatMessage(PLACEHOLDER)}
                            value={draft}
                            onChange={handleInputChange}
                            aria-describedby={error ? 'sf-zip-code-error' : undefined}
                        />
                        {draft && (
                            <InputRightElement>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={handleClear}
                                    aria-label={formatMessage({
                                        id: 'zip_code_filter.button.clear_input',
                                        defaultMessage: 'Clear input'
                                    })}
                                >
                                    ×
                                </Button>
                            </InputRightElement>
                        )}
                    </InputGroup>
                    <Button
                        type="submit"
                        colorScheme="blue"
                        data-testid="sf-zip-code-apply"
                    >
                        <FormattedMessage
                            id="zip_code_filter.button.apply"
                            defaultMessage="Apply"
                        />
                    </Button>
                </Stack>
                {error && (
                    <FormErrorMessage id="sf-zip-code-error">{error}</FormErrorMessage>
                )}
            </FormControl>
        </Box>
    )
}

ZipCodeFilter.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    onClear: PropTypes.func,
    debounceMs: PropTypes.number,
    isCompact: PropTypes.bool
}

export default ZipCodeFilter
