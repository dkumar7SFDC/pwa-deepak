/*
 * Copyright (c) 2026, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React from 'react'
import PropTypes from 'prop-types'
import {FormattedMessage, FormattedNumber, useIntl} from 'react-intl'
import {
    Box,
    Flex,
    FormControl,
    FormLabel,
    Input,
    Stack,
    Text,
    Tooltip
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {CardElement} from '@stripe/react-stripe-js'
import {LockIcon} from '@salesforce/retail-react-app/app/components/icons'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useCurrency} from '@salesforce/retail-react-app/app/hooks'

/**
 * Stripe-hosted card input form.
 *
 * Renders Stripe's `<CardElement>` (an iframe owned by Stripe that collects
 * card number / expiry / CVC) and a small cardholder-name field. The actual
 * card data never touches our React state or any of our servers — only the
 * tokenized result returned by `stripe.createToken(...)` does.
 *
 * The parent component is responsible for:
 *  - Wrapping this form in a Stripe `<Elements>` provider.
 *  - Calling `stripe.createToken(elements.getElement(CardElement))` when the
 *    user submits the checkout payment step, then forwarding the token to
 *    SCAPI's `addPaymentInstrumentToBasket` mutation.
 *
 * This component intentionally does not own the submit button; the existing
 * checkout payment step provides one.
 */
const StripeCardForm = ({
    cardholderName,
    onCardholderNameChange,
    cardError,
    onCardChange,
    isDisabled = false
}) => {
    const {formatMessage} = useIntl()
    const {data: basket} = useCurrentBasket()
    const {currency} = useCurrency()

    const cardElementOptions = {
        disabled: isDisabled,
        // Hide the postal-code field rendered by Stripe inside the CardElement
        // — billing postal code is collected by the existing billing-address
        // form on the same checkout step, so we avoid asking twice.
        hidePostalCode: true,
        style: {
            base: {
                fontSize: '16px',
                color: '#171717',
                fontFamily:
                    "'Salesforce Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                '::placeholder': {
                    color: '#A0AEC0'
                }
            },
            invalid: {
                color: '#C53030',
                iconColor: '#C53030'
            }
        }
    }

    return (
        <Box border="1px solid" borderColor="gray.100" rounded="base" overflow="hidden">
            <Box
                py={3}
                px={[4, 4, 6]}
                bg="gray.50"
                borderBottom="1px solid"
                borderColor="gray.100"
            >
                <Flex justify="space-between" align="center">
                    <Stack direction="row" align="center">
                        <Text fontWeight="bold">
                            <FormattedMessage
                                defaultMessage="Credit Card"
                                id="stripe_payment.heading.credit_card"
                            />
                        </Text>
                        <Tooltip
                            hasArrow
                            placement="top"
                            label={formatMessage({
                                defaultMessage:
                                    'Your card details are encrypted and processed by Stripe. We never see or store your full card number.',
                                id: 'stripe_payment.tooltip.secure_payment'
                            })}
                        >
                            <LockIcon color="gray.700" boxSize={5} />
                        </Tooltip>
                    </Stack>
                    {basket?.orderTotal != null && (
                        <Text fontWeight="bold">
                            <FormattedNumber
                                value={basket.orderTotal}
                                style="currency"
                                currency={currency}
                            />
                        </Text>
                    )}
                </Flex>
            </Box>

            <Stack spacing={4} p={[4, 4, 6]}>
                <FormControl isRequired>
                    <FormLabel fontSize="sm" fontWeight="semibold">
                        <FormattedMessage
                            defaultMessage="Name on Card"
                            id="stripe_payment.label.cardholder_name"
                        />
                    </FormLabel>
                    <Input
                        type="text"
                        autoComplete="cc-name"
                        value={cardholderName}
                        onChange={(e) => onCardholderNameChange(e.target.value)}
                        isDisabled={isDisabled}
                        placeholder={formatMessage({
                            defaultMessage: 'Full name as shown on card',
                            id: 'stripe_payment.placeholder.cardholder_name'
                        })}
                        data-testid="sf-stripe-cardholder-name"
                    />
                </FormControl>

                <FormControl isInvalid={!!cardError}>
                    <FormLabel fontSize="sm" fontWeight="semibold">
                        <FormattedMessage
                            defaultMessage="Card Details"
                            id="stripe_payment.label.card_details"
                        />
                    </FormLabel>
                    <Box
                        borderWidth="1px"
                        borderColor={cardError ? 'red.500' : 'gray.200'}
                        borderRadius="md"
                        bg={isDisabled ? 'gray.50' : 'white'}
                        px={3}
                        py={3}
                        data-testid="sf-stripe-card-element"
                        aria-label={formatMessage({
                            defaultMessage: 'Card details',
                            id: 'stripe_payment.aria_label.card_details'
                        })}
                    >
                        <CardElement options={cardElementOptions} onChange={onCardChange} />
                    </Box>
                    {cardError && (
                        <Text mt={1} fontSize="sm" color="red.600" role="alert">
                            {cardError}
                        </Text>
                    )}
                </FormControl>

                <Text fontSize="xs" color="gray.600">
                    <FormattedMessage
                        defaultMessage="Payments are securely processed by Stripe. Your card details are tokenized in your browser and never reach our servers."
                        id="stripe_payment.helper_text.pci_disclaimer"
                    />
                </Text>
            </Stack>
        </Box>
    )
}

StripeCardForm.propTypes = {
    /** Controlled cardholder name value. */
    cardholderName: PropTypes.string.isRequired,
    /** Setter for the cardholder name (controlled component). */
    onCardholderNameChange: PropTypes.func.isRequired,
    /**
     * Latest error message from `<CardElement>`'s onChange (or from a failed
     * tokenization attempt). When non-empty, the field is rendered in an
     * error state.
     */
    cardError: PropTypes.string,
    /**
     * Pass-through for `<CardElement>`'s onChange so the parent can track
     * `complete` / `empty` / `error` state and gate the submit button.
     */
    onCardChange: PropTypes.func,
    /** Disables both fields while a network request is in flight. */
    isDisabled: PropTypes.bool
}

export default StripeCardForm
