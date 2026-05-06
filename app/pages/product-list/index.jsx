/*
 * Copyright (c) 2022, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React, {useEffect, useMemo, useRef, useState} from 'react'
import PropTypes from 'prop-types'
import {useHistory, useLocation, useParams} from 'react-router-dom'
import {FormattedMessage, useIntl} from 'react-intl'
import {Helmet} from 'react-helmet'
import {
    useCategory,
    useCustomerId,
    useProductSearch,
    useShopperCustomersMutation,
    useShopperBasketsV2MutationHelper as useShopperBasketsMutationHelper
} from '@salesforce/commerce-sdk-react'
import {useServerContext} from '@salesforce/pwa-kit-react-sdk/ssr/universal/hooks'

// Components
import {
    Box,
    Flex,
    SimpleGrid,
    Grid,
    Select,
    Heading,
    Text,
    FormControl,
    Stack,
    useDisclosure,
    Button,
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter,
    ModalContent,
    ModalCloseButton,
    ModalOverlay,
    Drawer,
    DrawerBody,
    DrawerHeader,
    DrawerOverlay,
    DrawerContent,
    DrawerCloseButton,
    Spinner
} from '@salesforce/retail-react-app/app/components/shared/ui'

// Project Components
import ProductTile, {
    Skeleton as ProductTileSkeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import {HideOnDesktop} from '@salesforce/retail-react-app/app/components/responsive'
import Refinements from '@salesforce/retail-react-app/app/pages/product-list/partials/refinements'
import CategoryLinks from '@salesforce/retail-react-app/app/pages/product-list/partials/category-links'
import SelectedRefinements from '@salesforce/retail-react-app/app/pages/product-list/partials/selected-refinements'
import EmptySearchResults from '@salesforce/retail-react-app/app/pages/product-list/partials/empty-results'
import PageHeader from '@salesforce/retail-react-app/app/pages/product-list/partials/page-header'
import AbovePageHeader from '@salesforce/retail-react-app/app/pages/product-list/partials/above-page-header'
import PageDesignerPromotionalBanner from '@salesforce/retail-react-app/app/pages/product-list/partials/page-designer-promotional-banner'
import StoreInventoryFilter from '@salesforce/retail-react-app/app/pages/product-list/partials/inventory-filter'
import Island from '@salesforce/retail-react-app/app/components/island'

// Icons
import {FilterIcon, ChevronDownIcon} from '@salesforce/retail-react-app/app/components/icons'

// Hooks
import {
    useLimitUrls,
    useSortUrls,
    useSearchParams
} from '@salesforce/retail-react-app/app/hooks'
import {useToast} from '@salesforce/retail-react-app/app/hooks/use-toast'
import useEinstein from '@salesforce/retail-react-app/app/hooks/use-einstein'
import useDataCloud from '@salesforce/retail-react-app/app/hooks/use-datacloud'
import useActiveData from '@salesforce/retail-react-app/app/hooks/use-active-data'
import useIntersectionObserver from '@salesforce/retail-react-app/app/hooks/use-intersection-observer'
import {useZipCode} from '@salesforce/retail-react-app/app/hooks/use-zip-code'

// ZIP-code-based product filtering (SCAPI custom attribute c_zipCodes).
import ZipCodeFilter from '@salesforce/retail-react-app/app/components/zip-code-filter'

// Others
import {HTTPNotFound, HTTPError} from '@salesforce/pwa-kit-react-sdk/ssr/universal/errors'
import logger from '@salesforce/retail-react-app/app/utils/logger-instance'

// Constants
import {
    DEFAULT_LIMIT_VALUES,
    API_ERROR_MESSAGE,
    MAX_CACHE_AGE,
    TOAST_ACTION_VIEW_WISHLIST,
    TOAST_MESSAGE_ADDED_TO_WISHLIST,
    TOAST_MESSAGE_REMOVED_FROM_WISHLIST,
    STALE_WHILE_REVALIDATE,
    PRODUCT_LIST_IMAGE_VIEW_TYPE,
    PRODUCT_LIST_SELECTABLE_ATTRIBUTE_ID,
    STORE_LOCATOR_IS_ENABLED
} from '@salesforce/retail-react-app/app/constants'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'
import useNavigation from '@salesforce/retail-react-app/app/hooks/use-navigation'
import LoadingSpinner from '@salesforce/retail-react-app/app/components/loading-spinner'
import {useWishList} from '@salesforce/retail-react-app/app/hooks/use-wish-list'
import {isHydrated} from '@salesforce/retail-react-app/app/utils/utils'

// NOTE: You can ignore certain refinements on a template level by updating the below
// list of ignored refinements.
const REFINEMENT_DISALLOW_LIST = ['c_isNew']

/*
 * This is a simple product listing page. It displays a paginated list
 * of product hit objects. Allowing for sorting and filtering based on the
 * allowable filters and sort refinements.
 */
const ProductList = (props) => {
    // Using destructuring to omit properties; we must rename `isLoading` because we use a different
    // `isLoading` later in this function.
    // eslint-disable-next-line react/prop-types, @typescript-eslint/no-unused-vars
    const {isLoading: _unusedIsLoading, staticContext, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()
    const {formatMessage} = useIntl()
    const navigate = useNavigation()
    const history = useHistory()
    const params = useParams()
    const location = useLocation()
    const toast = useToast()
    const einstein = useEinstein()
    const dataCloud = useDataCloud()
    const activeData = useActiveData()
    const {res} = useServerContext()
    const customerId = useCustomerId()
    const [searchParams, {stringify: stringifySearchParams}] = useSearchParams()
    const storeLocatorEnabled = getConfig()?.app?.storeLocatorEnabled ?? STORE_LOCATOR_IS_ENABLED

    /**************** Page State ****************/
    const [filtersLoading, setFiltersLoading] = useState(false)
    const [wishlistLoading, setWishlistLoading] = useState([])
    const [addToCartLoading, setAddToCartLoading] = useState([])
    const [sortOpen, setSortOpen] = useState(false)
    const [searchByInventory, setSearchByInventory] = useState(null)

    // ZIP-code refinement state (persisted in localStorage under `userZip`).
    // The hook hydrates from storage after the first client render so that
    // SSR and CSR markup stay aligned.
    const [zip, setZip, clearZip] = useZipCode()

    const urlParams = new URLSearchParams(location.search)
    let searchQuery = urlParams.get('q')
    const isSearch = !!searchQuery

    if (params.categoryId) {
        searchParams._refine.push(`cgid=${params.categoryId}`)
    }

    /**************** Mutation Actions ****************/
    const {mutateAsync: createCustomerProductListItem} = useShopperCustomersMutation(
        'createCustomerProductListItem'
    )
    const {mutateAsync: deleteCustomerProductListItem} = useShopperCustomersMutation(
        'deleteCustomerProductListItem'
    )

    // SCAPI Shopper Baskets helper: transparently creates a basket if one doesn't exist yet
    // (for guests and logged-in customers) and otherwise calls `addItemToBasket` on the
    // current basket. This is the canonical way to add to cart in PWA Kit without a PDP round-trip.
    const {addItemToNewOrExistingBasket} = useShopperBasketsMutationHelper()

    /**************** Query Actions ****************/
    // _refine is an invalid param for useProductSearch, we don't want to pass it to API call
    const {_refine, ...restOfParams} = searchParams

    // Layer optional refinements on top of the URL-driven `_refine` array.
    // Order: store-inventory filter, then ZIP-code filter (custom attribute
    // c_zipCodes — note the plural; matches the BM attribute id).
    // SCAPI accepts each entry as a `key=value` string.
    const refineWithInventory = searchByInventory
        ? [..._refine, `ilids=${searchByInventory}`]
        : _refine
    const refine = zip ? [...refineWithInventory, `c_zipCodes=${zip}`] : refineWithInventory

    /**************** Infinite Scroll State ****************/
    // Internal offset that drives the product search request. We override the URL `offset`
    // so we can load more pages by simply incrementing this value when the sentinel below
    // the product grid scrolls into view.
    const pageLimit = restOfParams.limit || DEFAULT_LIMIT_VALUES[0]
    const [loadedOffset, setLoadedOffset] = useState(0)
    const [accumulatedHits, setAccumulatedHits] = useState([])
    // Track the last response offset that was merged into `accumulatedHits` so each response
    // is only appended once even if effects re-run.
    const lastAppendedOffsetRef = useRef(-1)

    // A signature representing the current "search". When this changes (filter, sort, search
    // query, category, etc. — anything except offset) we reset the infinite scroll state so
    // the user starts fresh from the top of the new result set.
    const searchSignature = useMemo(
        () =>
            JSON.stringify({
                q: restOfParams.q ?? null,
                sort: restOfParams.sort ?? null,
                limit: pageLimit,
                refine,
                cgid: params.categoryId ?? null
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [restOfParams.q, restOfParams.sort, pageLimit, JSON.stringify(refine), params.categoryId]
    )

    const previousSignatureRef = useRef(searchSignature)
    if (previousSignatureRef.current !== searchSignature) {
        previousSignatureRef.current = searchSignature
        // Reset synchronously during render so the immediate fetch uses offset 0.
        if (loadedOffset !== 0) setLoadedOffset(0)
        if (accumulatedHits.length !== 0) setAccumulatedHits([])
        lastAppendedOffsetRef.current = -1
    }

    const {
        isLoading,
        isFetched,
        isFetching,
        isRefetching,
        data: productSearchResult
    } = useProductSearch(
        {
            parameters: {
                ...restOfParams,
                offset: loadedOffset,
                perPricebook: true,
                allVariationProperties: true,
                allImages: true,
                expand: [
                    'promotions',
                    'variations',
                    'prices',
                    'images',
                    'page_meta_tags',
                    'custom_properties'
                ],
                refine
            }
        },
        {
            keepPreviousData: true
        }
    )

    // Append (or replace, for offset 0) hits whenever the latest response arrives. We hold off
    // committing the response while we're still on the very first fetch (no prior data yet) so
    // that the initial render can show skeletons rather than partial/intermediate data.
    useEffect(() => {
        if (!productSearchResult?.hits) return
        if (isRefetching && !isFetched) return
        const responseOffset = productSearchResult.offset ?? 0
        if (responseOffset === 0) {
            setAccumulatedHits(productSearchResult.hits)
            lastAppendedOffsetRef.current = 0
        } else if (responseOffset > lastAppendedOffsetRef.current) {
            setAccumulatedHits((prev) => {
                // Defensively de-duplicate in case the same offset slipped through twice.
                const seen = new Set(prev.map((h) => h.productId))
                const fresh = productSearchResult.hits.filter((h) => !seen.has(h.productId))
                return [...prev, ...fresh]
            })
            lastAppendedOffsetRef.current = responseOffset
        }
    }, [productSearchResult, isRefetching, isFetched])

    const {error, data: category} = useCategory(
        {
            parameters: {
                id: params.categoryId
            }
        },
        {
            enabled: !isSearch && !!params.categoryId
        }
    )

    // Apply disallow list to refinements.
    if (productSearchResult?.refinements) {
        productSearchResult.refinements = productSearchResult.refinements.filter(
            ({attributeId}) => !REFINEMENT_DISALLOW_LIST.includes(attributeId)
        )
    }

    /**************** Error Handling ****************/
    const errorStatus = error?.response?.status
    switch (errorStatus) {
        case undefined:
            // No Error.
            break
        case 404:
            throw new HTTPNotFound('Category Not Found.')
        default:
            throw new HTTPError(errorStatus, `HTTP Error ${errorStatus} occurred.`)
    }

    /**************** Response Handling ****************/
    if (res) {
        res.set(
            'Cache-Control',
            `s-maxage=${MAX_CACHE_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`
        )
    }

    // Reset scroll position when filters/sort/search change (i.e. while we're still on the
    // first page of the result set). We skip this for `loadedOffset > 0` so that scrolling
    // down to load more does not yank the viewport back to the top.
    useEffect(() => {
        if (loadedOffset !== 0) return
        if (isRefetching) window.scrollTo(0, 0)
        setFiltersLoading(isRefetching)
    }, [isRefetching, loadedOffset])

    /**************** Render Variables ****************/
    const basePath = `${location.pathname}${location.search}`
    const total = productSearchResult?.total ?? 0
    const showNoResults =
        !isLoading && productSearchResult && total === 0 && accumulatedHits.length === 0
    const {sortingOptions} = productSearchResult || {}
    const selectedSortingOptionLabel =
        sortingOptions?.find(
            (option) => option.id === productSearchResult?.selectedSortingOption
        ) ?? sortingOptions?.[0]

    const sortUrls = useSortUrls({options: sortingOptions})
    const limitUrls = useLimitUrls()

    /**************** Infinite Scroll Trigger ****************/
    const sentinelRef = useRef(null)
    const isSentinelVisible = useIntersectionObserver(sentinelRef, {rootMargin: '600px 0px'})
    const hasMore = accumulatedHits.length > 0 && accumulatedHits.length < total
    const isLoadingMore =
        isFetching && accumulatedHits.length > 0 && loadedOffset > lastAppendedOffsetRef.current

    useEffect(() => {
        if (!isSentinelVisible) return
        if (!hasMore || isFetching) return
        const nextOffset = accumulatedHits.length
        if (nextOffset > loadedOffset && nextOffset < total) {
            setLoadedOffset(nextOffset)
        }
    }, [isSentinelVisible, hasMore, isFetching, accumulatedHits.length, loadedOffset, total])

    /**************** Action Handlers ****************/
    const {data: wishlist} = useWishList()
    const addItemToWishlist = async (product) => {
        setWishlistLoading([...wishlistLoading, product.productId])

        // TODO: This wishlist object is from an old API, we need to replace it with the new one.
        const listId = wishlist.id
        await createCustomerProductListItem(
            {
                parameters: {customerId, listId},
                body: {
                    quantity: 1,
                    public: false,
                    priority: 1,
                    type: 'product',
                    productId: product.productId
                }
            },
            {
                onError: () => {
                    toast({
                        title: formatMessage(API_ERROR_MESSAGE),
                        status: 'error'
                    })
                },
                onSuccess: () => {
                    toast({
                        title: formatMessage(TOAST_MESSAGE_ADDED_TO_WISHLIST, {quantity: 1}),
                        status: 'success',
                        action: (
                            // it would be better if we could use <Button as={Link}>
                            // but unfortunately the Link component is not compatible
                            // with Chakra Toast, since the ToastManager is rendered via portal
                            // and the toast doesn't have access to intl provider, which is a
                            // requirement of the Link component.
                            <Button variant="link" onClick={() => navigate('/account/wishlist')}>
                                {formatMessage(TOAST_ACTION_VIEW_WISHLIST)}
                            </Button>
                        )
                    })
                },
                onSettled: () => {
                    setWishlistLoading(wishlistLoading.filter((id) => id !== product.productId))
                }
            }
        )
    }

    const removeItemFromWishlist = async (product) => {
        setWishlistLoading([...wishlistLoading, product.productId])

        const listId = wishlist.id
        const itemId = wishlist.customerProductListItems.find(
            (i) => i.productId === product.productId
        ).id

        await deleteCustomerProductListItem(
            {
                body: {},
                parameters: {customerId, listId, itemId}
            },
            {
                onError: () => {
                    toast({
                        title: formatMessage(API_ERROR_MESSAGE),
                        status: 'error'
                    })
                },
                onSuccess: () => {
                    toast({
                        title: formatMessage(TOAST_MESSAGE_REMOVED_FROM_WISHLIST),
                        status: 'success'
                    })
                },
                onSettled: () => {
                    setWishlistLoading(wishlistLoading.filter((id) => id !== product.productId))
                }
            }
        )
    }

    // Add a product to the basket directly from the PLP tile via SCAPI Shopper Baskets.
    // - No page navigation occurs.
    // - `productId` is resolved by the tile to the orderable variant (or standard product) id.
    // - The helper creates a basket on demand for both guests and logged-in customers.
    // - Per-tile loading state is tracked by the hit-level `product.productId` (the master id
    //   for variation products) so the spinner stays anchored to the tile the user clicked,
    //   regardless of which swatch/variant they had selected.
    const handleAddToCartFromTile = async ({product, productId, quantity = 1}) => {
        if (!productId) return
        const tileKey = product?.productId || productId
        if (addToCartLoading.includes(tileKey)) return

        setAddToCartLoading((prev) => [...prev, tileKey])
        try {
            await addItemToNewOrExistingBasket([
                {
                    productId,
                    price: product?.price,
                    quantity
                }
            ])

            try {
                einstein.sendAddToCart([
                    {
                        product,
                        productId,
                        price: product?.price,
                        quantity
                    }
                ])
            } catch (err) {
                logger.error('Einstein sendAddToCart error', {
                    namespace: 'ProductList.handleAddToCartFromTile',
                    additionalProperties: {error: err, productId}
                })
            }

            toast({
                title: formatMessage(
                    {
                        id: 'product_list.info.added_to_cart',
                        defaultMessage:
                            '{quantity} {quantity, plural, one {item} other {items}} added to cart'
                    },
                    {quantity}
                ),
                status: 'success',
                action: (
                    // Chakra's ToastManager renders via portal *outside* the intl provider,
                    // so we MUST resolve the label to a plain string here with `formatMessage`
                    // (rather than rendering <FormattedMessage>, which would throw inside the
                    // portal and crash the page). This matches the wishlist toast pattern above.
                    <Button variant="link" onClick={() => navigate('/cart')}>
                        {formatMessage({
                            id: 'product_list.toast.action.view_cart',
                            defaultMessage: 'View Cart'
                        })}
                    </Button>
                )
            })
        } catch (error) {
            logger.error('Add to cart from PLP failed', {
                namespace: 'ProductList.handleAddToCartFromTile',
                additionalProperties: {error, productId}
            })
            toast({
                title: formatMessage(API_ERROR_MESSAGE),
                status: 'error'
            })
        } finally {
            setAddToCartLoading((prev) => prev.filter((id) => id !== tileKey))
        }
    }

    // Toggles filter on and off
    const toggleFilter = (value, attributeId, selected, allowMultiple = true) => {
        // Special handling for inventory filter
        if (attributeId === 'ilids') {
            if (!selected) {
                setSearchByInventory(value.value)
            } else {
                setSearchByInventory(null)
            }
            return
        }

        const searchParamsCopy = {...searchParams}

        // Remove the `offset` search param if present.
        delete searchParamsCopy.offset

        // If we aren't allowing for multiple selections, simply clear any value set for the
        // attribute, and apply a new one if required.
        if (!allowMultiple) {
            const previousValue = searchParamsCopy.refine[attributeId]
            delete searchParamsCopy.refine[attributeId]

            // Note the loose comparison, for "string != number" checks.
            if (!selected && value.value != previousValue) {
                searchParamsCopy.refine[attributeId] = value.value
            }
        } else {
            // Get the attibute value as an array.
            let attributeValue = searchParamsCopy.refine[attributeId] || []

            // Ensure that the value is still converted into an array if it's a `string` or `number`.
            if (typeof attributeValue === 'string') {
                attributeValue = attributeValue.split('|')
            } else if (typeof attributeValue === 'number') {
                attributeValue = [attributeValue]
            }

            // Either set the value, or filter the value out.
            if (!selected) {
                attributeValue.push(value.value)
            } else {
                // Note the loose comparison, for "string != number" checks.
                attributeValue = attributeValue?.filter((v) => v != value.value)
            }

            // Update the attribute value in the new search params.
            searchParamsCopy.refine[attributeId] = attributeValue

            // If the update value is an empty array, remove the current attribute key.
            if (searchParamsCopy.refine[attributeId].length === 0) {
                delete searchParamsCopy.refine[attributeId]
            }
        }

        if (isSearch) {
            navigate(`/search?${stringifySearchParams(searchParamsCopy)}`)
        } else {
            navigate(`/category/${params.categoryId}?${stringifySearchParams(searchParamsCopy)}`)
        }
    }

    // Clears all filters
    const resetFilters = () => {
        const newSearchParams = {
            ...searchParams,
            refine: []
        }
        setSearchByInventory(null)
        const newPath = isSearch
            ? `/search?${stringifySearchParams(newSearchParams)}`
            : `/category/${params.categoryId}?${stringifySearchParams(newSearchParams)}`

        navigate(newPath)
    }

    // Helper function to create StoreInventoryFilter component
    const createStoreInventoryFilter = () => {
        if (!storeLocatorEnabled) return null
        return (
            <StoreInventoryFilter
                key="storeInventoryFilter"
                toggleFilter={toggleFilter}
                selectedFilters={productSearchResult?.selectedRefinements || {}}
            />
        )
    }

    /**************** Einstein ****************/
    useEffect(() => {
        if (productSearchResult) {
            if (isSearch) {
                try {
                    einstein.sendViewSearch(searchQuery, productSearchResult)
                } catch (err) {
                    logger.error('Einstein sendViewSearch error', {
                        namespace: 'ProductList.useEffect',
                        additionalProperties: {error: err, searchQuery}
                    })
                }
                dataCloud.sendViewSearchResults(searchParams, productSearchResult)
                activeData.sendViewSearch(searchParams, productSearchResult)
            } else {
                try {
                    einstein.sendViewCategory(category, productSearchResult)
                } catch (err) {
                    logger.error('Einstein sendViewCategory error', {
                        namespace: 'ProductList.useEffect',
                        additionalProperties: {error: err, category}
                    })
                }
                dataCloud.sendViewCategory(searchParams, category, productSearchResult)
                activeData.sendViewCategory(searchParams, category, productSearchResult)
            }
        }
    }, [productSearchResult])

    return (
        <Box
            className="sf-product-list-page"
            data-testid="sf-product-list-page"
            layerStyle="page"
            paddingTop={{base: 6, lg: 8}}
            {...rest}
        >
            <Helmet>
                <title>{category?.pageTitle ?? searchQuery}</title>
                <meta name="description" content={category?.pageDescription ?? searchQuery} />
                <meta name="keywords" content={category?.pageKeywords} />
                {productSearchResult?.pageMetaTags?.map(({id, value}) => {
                    return <meta name={id} content={value} key={id} />
                })}
            </Helmet>
            <>
                <AbovePageHeader />
                <PageDesignerPromotionalBanner />

                {/* ZIP-code refinement (persisted in localStorage as `userZip`).
                    Updating the value re-runs the SCAPI search via the
                    refine[] dependency in the `useProductSearch` call above. */}
                <Box marginBottom={4}>
                    <ZipCodeFilter
                        value={zip}
                        onChange={(next) => setZip(next)}
                        onClear={() => clearZip()}
                    />
                </Box>

                {/* Header */}
                <Stack
                    display={{base: 'none', lg: 'flex'}}
                    direction="row"
                    justify="flex-start"
                    align="flex-start"
                    spacing={4}
                    marginBottom={6}
                >
                    <Flex align="left" width="287px">
                        <PageHeader
                            searchQuery={searchQuery}
                            category={category}
                            productSearchResult={productSearchResult}
                            isLoading={isLoading}
                        />
                    </Flex>

                    <Box flex={1} paddingTop={'45px'}>
                        <SelectedRefinements
                            filters={productSearchResult?.refinements}
                            toggleFilter={toggleFilter}
                            handleReset={resetFilters}
                            selectedFilterValues={productSearchResult?.selectedRefinements}
                        />
                    </Box>
                    <Box paddingTop={'45px'}>
                        <Sort
                            sortUrls={sortUrls}
                            productSearchResult={productSearchResult}
                            basePath={basePath}
                        />
                    </Box>
                </Stack>

                {/* Filter Button for Mobile */}
                <HideOnDesktop>
                    <Stack spacing={6}>
                        <PageHeader
                            searchQuery={searchQuery}
                            category={category}
                            productSearchResult={productSearchResult}
                            isLoading={isLoading}
                        />
                        <Stack
                            display={{base: 'flex', md: 'none'}}
                            direction="row"
                            justify="flex-start"
                            align="center"
                            spacing={1}
                            height={12}
                            borderColor="gray.100"
                        >
                            <Flex align="center">
                                <Button
                                    fontSize="sm"
                                    colorScheme="black"
                                    variant="outline"
                                    marginRight={2}
                                    display="inline-flex"
                                    leftIcon={<FilterIcon boxSize={5} />}
                                    onClick={onOpen}
                                >
                                    <FormattedMessage
                                        defaultMessage="Filter"
                                        id="product_list.button.filter"
                                    />
                                </Button>
                            </Flex>
                            <Flex align="center">
                                <Button
                                    maxWidth="245px"
                                    fontSize="sm"
                                    marginRight={2}
                                    colorScheme="black"
                                    variant="outline"
                                    display="inline-flex"
                                    rightIcon={<ChevronDownIcon boxSize={5} />}
                                    onClick={() => setSortOpen(true)}
                                >
                                    {formatMessage(
                                        {
                                            id: 'product_list.button.sort_by',
                                            defaultMessage: 'Sort By: {sortOption}'
                                        },
                                        {
                                            sortOption: selectedSortingOptionLabel?.label
                                        }
                                    )}
                                </Button>
                            </Flex>
                        </Stack>
                    </Stack>
                    <Box marginBottom={4}>
                        <SelectedRefinements
                            filters={productSearchResult?.refinements}
                            toggleFilter={toggleFilter}
                            handleReset={resetFilters}
                            selectedFilterValues={productSearchResult?.selectedRefinements}
                        />
                    </Box>
                </HideOnDesktop>

                {/* Body  */}
                <Grid templateColumns={{base: '1fr', md: '280px 1fr'}} columnGap={6}>
                    <Stack display={{base: 'none', md: 'flex'}}>
                        <Island hydrateOn={'visible'}>
                            <Refinements
                                itemsBefore={
                                    category?.categories
                                        ? [
                                              <CategoryLinks
                                                  key="itemsBefore"
                                                  category={category}
                                                  onSelect={onClose}
                                              />,
                                              createStoreInventoryFilter()
                                          ].filter(Boolean)
                                        : [createStoreInventoryFilter()].filter(Boolean)
                                }
                                isLoading={filtersLoading}
                                toggleFilter={toggleFilter}
                                filters={productSearchResult?.refinements}
                                excludedFilters={['cgid']}
                                selectedFilters={searchParams.refine}
                            />
                        </Island>
                    </Stack>
                    <Box>
                        {showNoResults && zip ? (
                            <Flex
                                data-testid="sf-product-list-no-zip-results"
                                direction="column"
                                alignItems="center"
                                textAlign="center"
                                paddingTop={28}
                                paddingBottom={28}
                                gap={4}
                                role="status"
                                aria-live="polite"
                            >
                                <Heading as="h2" fontSize={['lg', 'lg', 'xl', '2xl']}>
                                    <FormattedMessage
                                        id="product_list.no_results.zip"
                                        defaultMessage="No products available in your area"
                                    />
                                </Heading>
                                <Text color="gray.600" maxWidth="md">
                                    <FormattedMessage
                                        id="product_list.no_results.zip_help"
                                        defaultMessage="We couldn’t find any products that ship to {zip}. Try a different ZIP code or clear the filter to see all products."
                                        values={{zip}}
                                    />
                                </Text>
                                <Stack direction={{base: 'column', sm: 'row'}} spacing={3}>
                                    <Button onClick={() => clearZip()} variant="outline">
                                        <FormattedMessage
                                            id="product_list.no_results.zip.clear"
                                            defaultMessage="Clear ZIP filter"
                                        />
                                    </Button>
                                </Stack>
                            </Flex>
                        ) : showNoResults ? (
                            <EmptySearchResults searchQuery={searchQuery} category={category} />
                        ) : (
                            <>
                                <SimpleGrid
                                    columns={[2, 2, 4, 5]}
                                    spacingX={4}
                                    spacingY={{base: 12, lg: 16}}
                                >
                                    {isHydrated() &&
                                    accumulatedHits.length === 0 &&
                                    (isLoading ||
                                        isFetching ||
                                        (isRefetching && !isFetched) ||
                                        !productSearchResult)
                                        ? new Array(searchParams.limit)
                                              .fill(0)
                                              .map((value, index) => (
                                                  <ProductTileSkeleton key={index} />
                                              ))
                                        : accumulatedHits.map(
                                              (productSearchItem, index) => {
                                                  const productId = productSearchItem.productId
                                                  const isInWishlist =
                                                      !!wishlist?.customerProductListItems?.find(
                                                          (item) => item.productId === productId
                                                      )

                                                  return (
                                                      <Island
                                                          hydrateOn={'visible'}
                                                          key={productSearchItem.productId}
                                                      >
                                                          <ProductTile
                                                              data-testid={`sf-product-tile-${productSearchItem.productId}`}
                                                              product={productSearchItem}
                                                              enableFavourite={true}
                                                              enableAddToCart={true}
                                                              isFavourite={isInWishlist}
                                                              isAddingToCart={addToCartLoading.includes(
                                                                  productSearchItem.productId
                                                              )}
                                                              isRefreshingData={
                                                                  isRefetching && isFetched
                                                              }
                                                              imageViewType={
                                                                  PRODUCT_LIST_IMAGE_VIEW_TYPE
                                                              }
                                                              selectableAttributeId={
                                                                  PRODUCT_LIST_SELECTABLE_ATTRIBUTE_ID
                                                              }
                                                              onAddToCart={
                                                                  handleAddToCartFromTile
                                                              }
                                                              onClick={() => {
                                                                  if (searchQuery) {
                                                                      einstein.sendClickSearch(
                                                                          searchQuery,
                                                                          productSearchItem
                                                                      )
                                                                  } else if (category) {
                                                                      einstein.sendClickCategory(
                                                                          category,
                                                                          productSearchItem
                                                                      )
                                                                  }
                                                              }}
                                                              onFavouriteToggle={(
                                                                  toBeFavourite
                                                              ) => {
                                                                  const action = toBeFavourite
                                                                      ? addItemToWishlist
                                                                      : removeItemFromWishlist
                                                                  return action(productSearchItem)
                                                              }}
                                                              dynamicImageProps={{
                                                                  widths: [
                                                                      // Each product image can take up the full 50% of the screen width
                                                                      '50vw', // base <= 479px
                                                                      '50vw', // sm >= 480px ; <= 767px
                                                                      // Due to the search refinements panel (fixed 280px), the product images
                                                                      // grid doesn't consume the entire screen. The smaller the images get,
                                                                      // the more this extra panel impacts the calculation of the responsive
                                                                      // image dimensions. Thus, to prevent over-fetching, we define smaller
                                                                      // dimensions than the column definitions might suggest. Due to large
                                                                      // margins it's also fine to floor the values.
                                                                      '15vw' // 15vw is generally a good fit for sizes `md` and above:
                                                                      // md >= 768px ; <= 991px | 280px consume ~28-36% of the entire screen | 4 image columns on ~2/3 of the screen ==> ~16vw
                                                                      // lg >= 992px ; <= 1279px | 280px consume ~22-28% of the entire screen | 5 image columns on ~3/4 of the screen ==> ~15vw
                                                                      // xl >= 1280px ; <= 1535px | 280px consume ~18-22% of the entire screen | 5 image columns on ~4/5 of the screen ==> ~16vw
                                                                      // 2xl >= 1536px | 280px consume less than 18% of the screen | 5 image columns on ~5/6 of the screen ==> ~16vw
                                                                  ],
                                                                  // For the sake of LCP, load the first three product images
                                                                  // eagerly to ensure prioritized loading for all plus one
                                                                  // above-the-fold images on mobile and most above-the-fold
                                                                  // images on tablet and desktop.
                                                                  ...(index < 3
                                                                      ? {
                                                                            imageProps: {
                                                                                loading: 'eager'
                                                                            }
                                                                        }
                                                                      : {})
                                                              }}
                                                          />
                                                      </Island>
                                                  )
                                              }
                                          )}
                                </SimpleGrid>
                                {/* Infinite scroll sentinel + load-more indicator */}
                                <Box
                                    ref={sentinelRef}
                                    aria-hidden="true"
                                    height="1px"
                                    width="100%"
                                />
                                {isLoadingMore && (
                                    <Flex
                                        justifyContent="center"
                                        alignItems="center"
                                        paddingY={8}
                                        data-testid="sf-product-list-load-more"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        <Spinner
                                            thickness="3px"
                                            speed="0.65s"
                                            emptyColor="gray.200"
                                            color="blue.600"
                                            size="md"
                                        />
                                        <Text marginLeft={3} fontSize="sm" color="gray.600">
                                            <FormattedMessage
                                                defaultMessage="Loading more products..."
                                                id="product_list.label.loading_more"
                                            />
                                        </Text>
                                    </Flex>
                                )}

                                {/*
                                    Our design doesn't call for a page size select. Show this element
                                    if you want to add one to your design.
                                */}
                                <Select
                                    display="none"
                                    value={basePath}
                                    onChange={({target}) => {
                                        history.push(target.value)
                                    }}
                                >
                                    {limitUrls.map((href, index) => (
                                        <option key={href} value={href}>
                                            {DEFAULT_LIMIT_VALUES[index]}
                                        </option>
                                    ))}
                                </Select>
                            </>
                        )}
                    </Box>
                </Grid>
            </>
            {/* Modal for filter options on mobile */}
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                size="full"
                motionPreset="slideInBottom"
                scrollBehavior="inside"
            >
                <ModalOverlay />
                <ModalContent top={0} marginTop={0}>
                    <ModalHeader>
                        <Heading as="h1" fontWeight="bold" fontSize="2xl">
                            <FormattedMessage
                                defaultMessage="Filter"
                                id="product_list.modal.title.filter"
                            />
                        </Heading>
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody py={4}>
                        {filtersLoading && <LoadingSpinner />}
                        <Refinements
                            toggleFilter={toggleFilter}
                            filters={productSearchResult?.refinements}
                            selectedFilters={searchParams.refine}
                            itemsBefore={
                                category?.categories
                                    ? [
                                          <CategoryLinks
                                              key="itemsBefore"
                                              category={category}
                                              onSelect={onClose}
                                          />,
                                          createStoreInventoryFilter()
                                      ].filter(Boolean)
                                    : [createStoreInventoryFilter()].filter(Boolean)
                            }
                            excludedFilters={['cgid']}
                        />
                    </ModalBody>

                    <ModalFooter
                        // justify="space-between"
                        display="block"
                        width="full"
                        borderTop="1px solid"
                        borderColor="gray.100"
                        paddingBottom={10}
                    >
                        <Stack>
                            <Button width="full" onClick={onClose}>
                                {formatMessage(
                                    {
                                        id: 'product_list.modal.button.view_items',
                                        defaultMessage: 'View {prroductCount} items'
                                    },
                                    {
                                        prroductCount: productSearchResult?.total
                                    }
                                )}
                            </Button>
                            <Button width="full" variant="outline" onClick={resetFilters}>
                                <FormattedMessage
                                    defaultMessage="Clear Filters"
                                    id="product_list.modal.button.clear_filters"
                                />
                            </Button>
                        </Stack>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            <Drawer
                placement="bottom"
                isOpen={sortOpen}
                onClose={() => setSortOpen(false)}
                size="sm"
                motionPreset="slideInBottom"
                scrollBehavior="inside"
                isFullHeight={false}
                height="50%"
            >
                <DrawerOverlay />
                <DrawerContent marginTop={0}>
                    <DrawerHeader boxShadow="none">
                        <Text fontWeight="bold" fontSize="2xl">
                            <FormattedMessage
                                defaultMessage="Sort By"
                                id="product_list.drawer.title.sort_by"
                            />
                        </Text>
                    </DrawerHeader>
                    <DrawerCloseButton />
                    <DrawerBody>
                        {sortUrls.map((href, idx) => (
                            <Button
                                width="full"
                                onClick={() => {
                                    setSortOpen(false)
                                    history.push(href)
                                }}
                                fontSize={'md'}
                                key={idx}
                                marginTop={0}
                                variant="menu-link"
                            >
                                <Text
                                    as={
                                        selectedSortingOptionLabel?.label ===
                                            productSearchResult?.sortingOptions[idx]?.label && 'u'
                                    }
                                >
                                    {productSearchResult?.sortingOptions[idx]?.label}
                                </Text>
                            </Button>
                        ))}
                    </DrawerBody>
                </DrawerContent>
            </Drawer>
        </Box>
    )
}

ProductList.getTemplateName = () => 'product-list'

ProductList.propTypes = {
    onAddToWishlistClick: PropTypes.func,
    onRemoveWishlistClick: PropTypes.func,
    category: PropTypes.object
}

export default ProductList

const Sort = ({sortUrls, productSearchResult, basePath, ...otherProps}) => {
    const intl = useIntl()
    const history = useHistory()

    return (
        <FormControl
            aria-label={intl.formatMessage({
                id: 'product_list.drawer.title.sort_by',
                defaultMessage: 'Sort By'
            })}
            data-testid="sf-product-list-sort"
            id="page_sort"
            width="auto"
            {...otherProps}
        >
            <Select
                id="sf-product-list-sort-select"
                aria-label={intl.formatMessage({
                    id: 'product_list.sort_by.label.assistive_msg',
                    defaultMessage: 'Sort products by'
                })}
                value={basePath.replace(/(offset)=(\d+)/i, '$1=0')}
                onChange={({target}) => {
                    history.push(target.value)
                }}
                height={11}
                width="240px"
            >
                {sortUrls.map((href, index) => (
                    <option key={href} value={href}>
                        {intl.formatMessage(
                            {
                                id: 'product_list.select.sort_by',
                                defaultMessage: 'Sort By: {sortOption}'
                            },
                            {
                                sortOption: productSearchResult?.sortingOptions[index]?.label
                            }
                        )}
                    </option>
                ))}
            </Select>
        </FormControl>
    )
}

Sort.propTypes = {
    sortUrls: PropTypes.array,
    productSearchResult: PropTypes.object,
    basePath: PropTypes.string
}
