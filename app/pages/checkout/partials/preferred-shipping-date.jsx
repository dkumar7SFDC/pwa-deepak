/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useEffect, useMemo, useState} from 'react'
import PropTypes from 'prop-types'
import {FormattedMessage, useIntl} from 'react-intl'
import {
    FormControl,
    FormLabel,
    Input,
    InputGroup,
    InputRightElement,
    Spinner,
    Text
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {API_ERROR_MESSAGE} from '@salesforce/retail-react-app/app/constants'

/**
 * Shipment-level custom attribute name that stores the shopper's preferred
 * shipping/delivery date. Persisted on the basket shipment via SCAPI so the
 * value flows automatically through to the resulting Order and onward to OMS.
 */
export const PREFERRED_SHIPPING_DATE_ATTR = 'c_preferredShippingDate'

const todayIso = () => new Date().toISOString().split('T')[0]

/**
 * Date picker that lets the shopper select a preferred delivery date for a
 * single basket shipment, persisted via SCAPI's `updateShipmentForBasket`.
 *
 * The persisted value lives in the shipment-level custom attribute
 * `c_preferredShippingDate` so it's automatically carried into the Order
 * record (and surfaced in OMS) without any backend customisation.
 */
const PreferredShippingDate = ({basketId, shipment}) => {
    const {formatMessage} = useIntl()
    const toast = useToast()
    const updateShipmentForBasket = useShopperBasketsMutation('updateShipmentForBasket')

    const persistedDate = shipment?.[PREFERRED_SHIPPING_DATE_ATTR] || ''
    const [shippingDate, setShippingDate] = useState(persistedDate)
    const minDate = useMemo(() => todayIso(), [])
    const inputId = `preferred-shipping-date-${shipment?.shipmentId}`

    // Keep local state in sync when the basket refetches (e.g. after navigating
    // back to the step) so the persisted date is always reflected in the UI.
    useEffect(() => {
        if (persistedDate !== shippingDate) {
            setShippingDate(persistedDate)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persistedDate])

    if (!basketId || !shipment?.shipmentId) {
        return null
    }

    const isSaving = updateShipmentForBasket.isLoading

    const handleDateChange = async (e) => {
        const selectedDate = e.target.value
        const previousDate = shippingDate

        setShippingDate(selectedDate)

        try {
            await updateShipmentForBasket.mutateAsync({
                parameters: {
                    basketId,
                    shipmentId: shipment.shipmentId
                },
                body: {
                    [PREFERRED_SHIPPING_DATE_ATTR]: selectedDate || null
                }
            })

            toast({
                title: formatMessage({
                    defaultMessage: 'Preferred delivery date updated',
                    id: 'preferred_shipping_date.toast.success'
                }),
                status: 'success'
            })
        } catch (error) {
            console.error('Failed to update preferred shipping date:', error)
            setShippingDate(previousDate)
            toast({
                title: formatMessage(API_ERROR_MESSAGE),
                status: 'error'
            })
        }
    }

    return (
        <FormControl id={inputId}>
            <FormLabel mb={1} fontSize="sm" fontWeight="semibold">
                <FormattedMessage
                    defaultMessage="Preferred Delivery Date"
                    id="preferred_shipping_date.label"
                />
            </FormLabel>
            <InputGroup>
                <Input
                    type="date"
                    value={shippingDate}
                    min={minDate}
                    onChange={handleDateChange}
                    isDisabled={isSaving}
                    bg="white"
                    aria-label={formatMessage({
                        defaultMessage: 'Preferred delivery date',
                        id: 'preferred_shipping_date.aria_label'
                    })}
                    data-testid={`sf-preferred-shipping-date-${shipment.shipmentId}`}
                />
                {isSaving && (
                    <InputRightElement pointerEvents="none">
                        <Spinner size="sm" color="gray.500" />
                    </InputRightElement>
                )}
            </InputGroup>
            <Text mt={1} fontSize="xs" color="gray.600">
                <FormattedMessage
                    defaultMessage="Pick the date you'd like your order delivered. Past dates are not allowed."
                    id="preferred_shipping_date.helper_text"
                />
            </Text>
        </FormControl>
    )
}

PreferredShippingDate.propTypes = {
    basketId: PropTypes.string.isRequired,
    shipment: PropTypes.shape({
        shipmentId: PropTypes.string.isRequired,
        c_preferredShippingDate: PropTypes.string
    }).isRequired
}

export default PreferredShippingDate
