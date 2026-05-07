/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useState, useMemo, useEffect} from 'react'
import PropTypes from 'prop-types'
import {defineMessage, FormattedMessage, useIntl} from 'react-intl'
import {
    Box,
    Button,
    Checkbox,
    Container,
    Heading,
    Stack,
    Text,
    Divider
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useForm} from 'react-hook-form'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import {useShopperBasketsV2Mutation as useShopperBasketsMutation} from '@salesforce/commerce-sdk-react'
import {CardElement, useElements, useStripe} from '@stripe/react-stripe-js'
import {useCurrentBasket} from '@salesforce/retail-react-app/app/hooks/use-current-basket'
import {useCheckout} from '@salesforce/retail-react-app/app/pages/checkout/util/checkout-context'
import {
    getPaymentInstrumentCardType,
    getMaskCreditCardNumber,
    getCreditCardIcon
} from '@salesforce/retail-react-app/app/utils/cc-utils'
import {
    ToggleCard,
    ToggleCardEdit,
    ToggleCardSummary
} from '@salesforce/retail-react-app/app/components/toggle-card'
import PaymentForm from '@salesforce/retail-react-app/app/pages/checkout/partials/payment-form'
import StripeCardForm from '@salesforce/retail-react-app/app/components/payment/stripe-card-form'
import {isStripeEnabled} from '@salesforce/retail-react-app/app/components/payment/stripe-provider'
import ShippingAddressSelection from '@salesforce/retail-react-app/app/pages/checkout/partials/shipping-address-selection'
import AddressDisplay from '@salesforce/retail-react-app/app/components/address-display'
import {PromoCode, usePromoCode} from '@salesforce/retail-react-app/app/components/promo-code'
import {API_ERROR_MESSAGE} from '@salesforce/retail-react-app/app/constants'
import {isPickupShipment} from '@salesforce/retail-react-app/app/utils/shipment-utils'

/**
 * Maps a Stripe card brand (e.g. `"visa"`, `"mastercard"`) to the SCAPI/B2C
 * Commerce card-type identifier (e.g. `"Visa"`, `"Master Card"`). Falls back
 * to the original brand string when no mapping exists so unusual brands still
 * render reasonably in the order summary.
 */
const stripeBrandToCommerceCardType = (brand) => {
    if (!brand) return undefined
    const map = {
        visa: 'Visa',
        mastercard: 'Master Card',
        amex: 'Amex',
        'american express': 'Amex',
        'american-express': 'Amex',
        discover: 'Discover'
    }
    return map[brand.toLowerCase()] || brand
}

const Payment = () => {
    const {formatMessage} = useIntl()
    const {data: basket} = useCurrentBasket()
    const isPickupOnly =
        basket?.shipments?.length > 0 &&
        basket.shipments.every((shipment) => isPickupShipment(shipment))
    const selectedShippingAddress = useMemo(() => {
        if (!basket?.shipments?.length || isPickupOnly) return null
        const deliveryShipment = basket.shipments.find((shipment) => !isPickupShipment(shipment))
        return deliveryShipment?.shippingAddress || null
    }, [basket?.shipments, isPickupShipment, isPickupOnly])

    const selectedBillingAddress = basket?.billingAddress
    const appliedPayment = basket?.paymentInstruments && basket?.paymentInstruments[0]
    const [billingSameAsShipping, setBillingSameAsShipping] = useState(!isPickupOnly)

    useEffect(() => {
        if (isPickupOnly) {
            setBillingSameAsShipping(false)
        }
    }, [isPickupOnly])

    const {mutateAsync: addPaymentInstrumentToBasket} = useShopperBasketsMutation(
        'addPaymentInstrumentToBasket'
    )
    const {mutateAsync: updateBillingAddressForBasket} = useShopperBasketsMutation(
        'updateBillingAddressForBasket'
    )
    const {mutateAsync: removePaymentInstrumentFromBasket} = useShopperBasketsMutation(
        'removePaymentInstrumentFromBasket'
    )
    const showToast = useToast()
    const showError = (message) => {
        showToast({
            title: message || formatMessage(API_ERROR_MESSAGE),
            status: 'error'
        })
    }

    const {step, STEPS, goToStep, goToNextStep} = useCheckout()

    const billingAddressForm = useForm({
        mode: 'onChange',
        shouldUnregister: false,
        defaultValues: {...selectedBillingAddress}
    })

    // Using destructuring to remove properties from the object...
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {removePromoCode, ...promoCodeProps} = usePromoCode()

    const paymentMethodForm = useForm()

    /**
     * Stripe-driven card payment state.
     * `useStripe` / `useElements` return `null` when no `<Elements>` provider
     * is present in the tree (e.g. when Stripe is not configured), which is
     * how we detect whether to use the Stripe flow at runtime in addition to
     * the build-time `isStripeEnabled()` check.
     */
    const stripe = useStripe()
    const elements = useElements()
    const stripeAvailable = isStripeEnabled() && !!stripe && !!elements
    const [cardholderName, setCardholderName] = useState('')
    const [stripeCardError, setStripeCardError] = useState('')
    const [isStripeCardComplete, setIsStripeCardComplete] = useState(false)
    const [isProcessingPayment, setIsProcessingPayment] = useState(false)

    const onStripeCardChange = (event) => {
        // Surface inline validation errors from Stripe (e.g. invalid number).
        // We never see card data here — only Stripe-provided status flags.
        setStripeCardError(event?.error?.message || '')
        setIsStripeCardComplete(Boolean(event?.complete))
    }

    /**
     * Tokenizes the current `<CardElement>` and pushes the resulting token
     * into the basket as a `CREDIT_CARD` payment instrument via SCAPI's
     * `addPaymentInstrumentToBasket` mutation.
     *
     * The token reference is stored on the *payment instrument* in two
     * places (NOT on the shipment):
     *   - `paymentCard.creditCardToken`   - standard SCAPI/B2C field, no
     *                                       BM setup required.
     *   - `c_stripeToken`                 - belt-and-suspenders custom
     *                                       attribute on the
     *                                       PaymentInstrument system
     *                                       object (define it in BM under
     *                                       PaymentInstrument > Custom
     *                                       Attributes if you want it
     *                                       persisted; otherwise SCAPI
     *                                       silently drops it).
     *
     * On the server side a Salesforce B2C cartridge / OMS extension is
     * expected to use the token (server-to-server) to charge the card
     * with the Stripe *secret* key. The publishable key never sees the
     * secret key.
     */
    const submitStripePayment = async () => {
        if (!cardholderName.trim()) {
            const message = formatMessage({
                defaultMessage: 'Please enter the name on the card.',
                id: 'stripe_payment.error.cardholder_required'
            })
            setStripeCardError(message)
            throw new Error(message)
        }

        const cardElement = elements.getElement(CardElement)
        if (!cardElement) {
            throw new Error('Stripe CardElement is not mounted')
        }

        const {token, error} = await stripe.createToken(cardElement, {
            name: cardholderName.trim()
        })

        if (error) {
            // Stripe returns user-safe error messages — surface them directly.
            setStripeCardError(error.message || formatMessage(API_ERROR_MESSAGE))
            throw error
        }

        const card = token?.card || {}
        const paymentInstrument = {
            paymentMethodId: 'CREDIT_CARD',
            // Letting SCAPI default to `basket.orderTotal` is intentional;
            // this stays correct even if promotions/totals change.
            paymentCard: {
                holder: cardholderName.trim(),
                cardType: stripeBrandToCommerceCardType(card.brand),
                // SCAPI's `OrderPaymentCardRequest` schema has `maskedNumber`
                // but NOT `numberLastDigits` — the latter is a response-only
                // field that B2C Commerce derives server-side from the mask.
                ...(card.last4 ? {maskedNumber: `************${card.last4}`} : {}),
                ...(card.exp_month ? {expirationMonth: card.exp_month} : {}),
                ...(card.exp_year ? {expirationYear: card.exp_year} : {}),
                // `creditCardToken` is a first-class SCAPI field designed for
                // tokenized PSPs. Storing the Stripe token here means it
                // flows through to the resulting Order's payment instrument
                // natively, with no Business-Manager custom-attribute setup.
                creditCardToken: token.id
            },
            // Belt-and-suspenders: also expose the token as a custom
            // attribute on the payment instrument so a B2C cartridge / OMS
            // extension can pick it up under a Stripe-specific name.
            // Define `stripeToken` on the PaymentInstrument system object in
            // BM if you want this attribute to be persisted; otherwise SCAPI
            // silently drops it (the `creditCardToken` field above is enough
            // on its own).
            c_stripeToken: token.id
        }

        return addPaymentInstrumentToBasket({
            parameters: {basketId: basket?.basketId},
            body: paymentInstrument
        })
    }

    const onPaymentSubmit = async (formValue) => {
        if (stripeAvailable) {
            return submitStripePayment()
        }

        // Legacy (non-Stripe) flow. Kept for backwards compatibility while
        // a merchant is bringing their Stripe configuration online; this
        // branch sends raw card fields straight to SCAPI which is NOT PCI
        // compliant by itself and should be retired once Stripe is enabled.
        const [expirationMonth, expirationYear] = formValue.expiry.split('/')

        const paymentInstrument = {
            paymentMethodId: 'CREDIT_CARD',
            paymentCard: {
                holder: formValue.holder,
                maskedNumber: getMaskCreditCardNumber(formValue.number),
                cardType: getPaymentInstrumentCardType(formValue.cardType),
                expirationMonth: parseInt(expirationMonth),
                expirationYear: parseInt(`20${expirationYear}`)
            }
        }

        return addPaymentInstrumentToBasket({
            parameters: {basketId: basket?.basketId},
            body: paymentInstrument
        })
    }
    const onBillingSubmit = async () => {
        const isFormValid = await billingAddressForm.trigger()

        if (!isFormValid) {
            return
        }
        const billingAddress = billingSameAsShipping
            ? selectedShippingAddress
            : billingAddressForm.getValues()
        // Using destructuring to remove properties from the object...
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {addressId, creationDate, lastModified, preferred, ...address} = billingAddress
        return await updateBillingAddressForBasket({
            body: address,
            parameters: {basketId: basket.basketId}
        })
    }
    const onPaymentRemoval = async () => {
        try {
            await removePaymentInstrumentFromBasket({
                parameters: {
                    basketId: basket.basketId,
                    paymentInstrumentId: appliedPayment.paymentInstrumentId
                }
            })
        } catch (e) {
            showError()
        }
    }

    /**
     * Unified submit handler.
     *
     * For the Stripe flow we sidestep react-hook-form's `handleSubmit` (since
     * Stripe owns the card inputs in an iframe and there's nothing for RHF to
     * validate); for the legacy flow we keep RHF in charge so existing field
     * validation is preserved.
     */
    const onSubmit = async (event) => {
        event?.preventDefault?.()
        setIsProcessingPayment(true)
        try {
            if (stripeAvailable) {
                if (!appliedPayment) {
                    await submitStripePayment()
                }
                const updatedBasket = await onBillingSubmit()
                if (updatedBasket) goToNextStep()
                return
            }

            await paymentMethodForm.handleSubmit(async (paymentFormValues) => {
                if (!appliedPayment) {
                    await onPaymentSubmit(paymentFormValues)
                }
                const updatedBasket = await onBillingSubmit()
                if (updatedBasket) goToNextStep()
            })()
        } catch (error) {
            // Stripe errors already get inline display via `stripeCardError`;
            // for everything else surface a toast so the failure isn't silent.
            if (!stripeAvailable || !error?.type?.startsWith?.('card_')) {
                showError(error?.message)
            }
        } finally {
            setIsProcessingPayment(false)
        }
    }

    const billingAddressAriaLabel = defineMessage({
        defaultMessage: 'Billing Address Form',
        id: 'checkout_payment.label.billing_address_form'
    })

    return (
        <ToggleCard
            id="step-3"
            title={formatMessage({defaultMessage: 'Payment', id: 'checkout_payment.title.payment'})}
            editing={step === STEPS.PAYMENT}
            isLoading={
                isProcessingPayment ||
                paymentMethodForm.formState.isSubmitting ||
                billingAddressForm.formState.isSubmitting
            }
            disabled={appliedPayment == null}
            onEdit={() => goToStep(STEPS.PAYMENT)}
            editLabel={formatMessage({
                defaultMessage: 'Edit Payment Info',
                id: 'toggle_card.action.editPaymentInfo'
            })}
        >
            <ToggleCardEdit>
                <Box mt={-2} mb={4}>
                    <PromoCode {...promoCodeProps} itemProps={{border: 'none'}} />
                </Box>

                <Stack spacing={6}>
                    {!appliedPayment?.paymentCard ? (
                        stripeAvailable ? (
                            <StripeCardForm
                                cardholderName={cardholderName}
                                onCardholderNameChange={setCardholderName}
                                cardError={stripeCardError}
                                onCardChange={onStripeCardChange}
                                isDisabled={isProcessingPayment}
                            />
                        ) : (
                            <PaymentForm form={paymentMethodForm} onSubmit={onPaymentSubmit} />
                        )
                    ) : (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Credit Card"
                                    id="checkout_payment.heading.credit_card"
                                />
                            </Heading>
                            <Stack direction="row" spacing={4}>
                                <PaymentCardSummary payment={appliedPayment} />
                                <Button
                                    variant="link"
                                    size="sm"
                                    colorScheme="red"
                                    onClick={onPaymentRemoval}
                                >
                                    <FormattedMessage
                                        defaultMessage="Remove"
                                        id="checkout_payment.action.remove"
                                    />
                                </Button>
                            </Stack>
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    <Stack spacing={2}>
                        <Heading as="h3" fontSize="md">
                            <FormattedMessage
                                defaultMessage="Billing Address"
                                id="checkout_payment.heading.billing_address"
                            />
                        </Heading>

                        {!isPickupOnly && (
                            <Checkbox
                                name="billingSameAsShipping"
                                isChecked={billingSameAsShipping}
                                onChange={(e) => setBillingSameAsShipping(e.target.checked)}
                            >
                                <Text fontSize="sm" color="gray.700">
                                    <FormattedMessage
                                        defaultMessage="Same as shipping address"
                                        id="checkout_payment.label.same_as_shipping"
                                    />
                                </Text>
                            </Checkbox>
                        )}

                        {billingSameAsShipping && selectedShippingAddress && (
                            <Box pl={7}>
                                <AddressDisplay address={selectedShippingAddress} />
                            </Box>
                        )}
                    </Stack>

                    {!billingSameAsShipping && (
                        <ShippingAddressSelection
                            form={billingAddressForm}
                            selectedAddress={selectedBillingAddress}
                            formTitleAriaLabel={billingAddressAriaLabel}
                            hideSubmitButton
                            isBillingAddress
                        />
                    )}

                    <Box pt={3}>
                        <Container variant="form">
                            <Button
                                w="full"
                                onClick={onSubmit}
                                isLoading={isProcessingPayment}
                                isDisabled={
                                    isProcessingPayment ||
                                    (stripeAvailable &&
                                        !appliedPayment?.paymentCard &&
                                        (!isStripeCardComplete || !cardholderName.trim()))
                                }
                                data-testid="sf-checkout-payment-submit"
                            >
                                <FormattedMessage
                                    defaultMessage="Review Order"
                                    id="checkout_payment.button.review_order"
                                />
                            </Button>
                        </Container>
                    </Box>
                </Stack>
            </ToggleCardEdit>

            <ToggleCardSummary>
                <Stack spacing={6}>
                    {appliedPayment && (
                        <Stack spacing={3}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Credit Card"
                                    id="checkout_payment.heading.credit_card"
                                />
                            </Heading>
                            <PaymentCardSummary payment={appliedPayment} />
                        </Stack>
                    )}

                    <Divider borderColor="gray.100" />

                    {selectedBillingAddress && (
                        <Stack spacing={2}>
                            <Heading as="h3" fontSize="md">
                                <FormattedMessage
                                    defaultMessage="Billing Address"
                                    id="checkout_payment.heading.billing_address"
                                />
                            </Heading>
                            <AddressDisplay address={selectedBillingAddress} />
                        </Stack>
                    )}
                </Stack>
            </ToggleCardSummary>
        </ToggleCard>
    )
}

const PaymentCardSummary = ({payment}) => {
    const CardIcon = getCreditCardIcon(payment?.paymentCard?.cardType)
    return (
        <Stack direction="row" alignItems="center" spacing={3}>
            {CardIcon && <CardIcon layerStyle="ccIcon" />}

            <Stack direction="row">
                <Text>{payment.paymentCard.cardType}</Text>
                <Text>&bull;&bull;&bull;&bull; {payment.paymentCard.numberLastDigits}</Text>
                <Text>
                    {payment.paymentCard.expirationMonth}/{payment.paymentCard.expirationYear}
                </Text>
            </Stack>
        </Stack>
    )
}

PaymentCardSummary.propTypes = {payment: PropTypes.object}

export default Payment
