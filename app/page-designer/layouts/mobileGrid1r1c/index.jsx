/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React from 'react'
import PropTypes from 'prop-types'
import {SimpleGrid} from '@salesforce/retail-react-app/app/components/shared/ui'
import {Region, regionPropType} from '@salesforce/commerce-sdk-react/page-designer'

/**
 * This layout component displays its children in a 1 x 1 grid on both mobile and desktop.
 *
 * The SDK's `<Component>` renderer passes the entire parent component as the
 * `component` prop. We forward it to `<Region>` along with the child region
 * id — the modern SDK Region API requires `component+regionId` (or
 * `page+regionId`); the legacy `<Region region={region} />` invocation is a
 * no-op against the current `@salesforce/commerce-sdk-react` Region.
 *
 * @param {componentProps} props
 * @param {regionType []} props.regions - The page designer regions for this component.
 * @param {object} props.component - The full Page Designer component descriptor (parent).
 * @returns {React.ReactElement} - Grid component.
 */
export const MobileGrid1r1c = ({regions, component}) => (
    <SimpleGrid className="mobile-1r-1c" columns={1}>
        {regions.map((region) => (
            <Region key={region.id} component={component} regionId={region.id} />
        ))}
    </SimpleGrid>
)

MobileGrid1r1c.displayName = 'MobileGrid1r1c'

MobileGrid1r1c.propTypes = {
    // Internally Provided by the SDK <Component> renderer.
    regions: PropTypes.arrayOf(regionPropType).isRequired,
    component: PropTypes.object.isRequired
}

export default MobileGrid1r1c
