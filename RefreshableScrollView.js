/**
 * @file react native refreshable scrollview component
 * @author James Ide
 * @author cxtom(cxtom2010@gmail.com)
 */

import React from 'react-native';

import ScrollableMixin from 'react-native-scrollable-mixin';
import TimerMixin from 'react-timer-mixin';

import cloneReferencedElement from 'react-native-clone-referenced-element';

import RefreshIndicator from './RefreshIndicator';

const {
    PropTypes,
    ScrollView,
    StyleSheet,
    View
} = React;

let styles;

const SCROLL_ANIMATION_DURATION_MS = 300;

let RefreshableScrollView = React.createClass({

    mixins: [ScrollableMixin, TimerMixin],

    propTypes: {
        ...ScrollView.propTypes,
        pullToRefreshDistance: PropTypes.number,
        onRefreshStart: PropTypes.func.isRequired,
        renderRefreshIndicator: PropTypes.func,
        releaseToRefresh: PropTypes.bool,
        indicatorStyle: PropTypes.object
    },

    getDefaultProps() {
        return {
            scrollEventThrottle: 33,
            releaseToRefresh: true,
            renderRefreshIndicator: props => <RefreshIndicator {...props} />,
            renderScrollComponent: props => <ScrollView {...props} />
        };
    },

    getInitialState() {

        return {

            /**
             * 是否在触摸滑动
             * @type {Boolean}
             */
            tracking: false,

            /**
             * 滑动到达可刷新位置的百分比
             * @type {Number}
             */
            pullToRefreshProgress: 0,

            /**
             * 是否正在刷新
             * @type {Boolean}
             */
            refreshing: false,

            waitingToRest: false,

            /**
             * 是否正在返回顶部
             * @type {Boolean}
             */
            returningToTop: false,

            /**
             * 是否需要返回
             * @type {Boolean}
             */
            shouldIncreaseContentInset: false,

            refreshIndicatorEnd: null
        };
    },

    shouldComponentUpdate(nextProps, nextState) {

        if (this.props !== nextProps) {
            return true;
        }

        let state = this.state;
        return Object
                .keys(nextState)
                .reduce(
                    (result, key) => result || nextState[key] !== state[key],
                    false
                );
    },

    getScrollResponder() {
        return this._scrollComponent.getScrollResponder();
    },

    setNativeProps(props) {
        this._scrollComponent.setNativeProps(props);
    },

    render() {
        let {
            contentInset,
            renderScrollComponent,
            style,
            indicatorStyle,
            ...scrollViewProps
        } = this.props;

        let refreshIndicatorStyle = {...indicatorStyle};

        if (this.props.horizontal) {
            if (contentInset && contentInset.left != null) {
                refreshIndicatorStyle.left = contentInset.left;
            }
            else {
                refreshIndicatorStyle.left = 0;
            }
        }
        else {
            if (contentInset && contentInset.top != null) {
                refreshIndicatorStyle.top = contentInset.top;
            }
            else {
                refreshIndicatorStyle.top = 0;
            }
        }

        let isRefreshIndicatorActive = this.state.refreshing || this.state.waitingToRest;
        if (!isRefreshIndicatorActive && this.state.pullToRefreshProgress <= 0) {
            refreshIndicatorStyle.opacity = 0;
        }

        let refreshIndicator = this.props.renderRefreshIndicator({
            progress: this.state.pullToRefreshProgress,
            active: isRefreshIndicatorActive
        });

        let scrollComponent = renderScrollComponent({
            pointerEvents: this.state.returningToTop ? 'none' : 'auto',
            ...scrollViewProps,
            contentInset: this.getContentInsetAdjustedForIndicator(),
            onResponderGrant: this.onResponderGrant,
            onResponderRelease: this.onResponderRelease,
            onScroll: this.onScroll,
            onMomentumScrollEnd: this.onMomentumScrollEnd,
            style: styles.scrollComponent
        });
        scrollComponent = cloneReferencedElement(scrollComponent, {
            ref: component => {
                this._scrollComponent = component;
            }
        });

        return (
            <View style={[styles.container, style]}>
                <View
                    pointerEvents="box-none"
                    onLayout={this.onRefreshIndicatorContainerLayout}
                    style={[styles.refreshIndicatorContainer, refreshIndicatorStyle]}>
                    {refreshIndicator}
                </View>
                {scrollComponent}
            </View>
        );
    },

    getContentInsetAdjustedForIndicator() {
        let {contentInset, horizontal} = this.props;
        let {shouldIncreaseContentInset} = this.state;

        if (!shouldIncreaseContentInset) {
            return contentInset;
        }

        contentInset = {...contentInset};
        if (horizontal) {
            contentInset.left = Math.max(
                this.state.refreshIndicatorEnd - this._nativeContentInsetAdjustment.left,
                contentInset.left != null ? contentInset.left : 0
            );
        }
        else {
            contentInset.top = Math.max(
                this.state.refreshIndicatorEnd - this._nativeContentInsetAdjustment.top,
                contentInset.top != null ? contentInset.top : 0
            );
        }
        return contentInset;
    },

    calculateNativeContentInsetAdjustment(nativeContentInset) {
        let {contentInset} = this._scrollComponent.props;
        let adjustment = {top: 0, left: 0, bottom: 0, right: 0};
        if (!contentInset) {
            return adjustment;
        }

        for (let side in adjustment) {
            if (contentInset[side] != null) {
                adjustment[side] = nativeContentInset[side] - contentInset[side];
            }
        }
        return adjustment;
    },

    onScroll(e) {

        if (this.props.onScroll) {
            this.props.onScroll(e);
        }

        let {contentInset, contentOffset} = e.nativeEvent;
        this._nativeContentInset = contentInset;
        this._nativeContentOffset = contentOffset;
        this._nativeContentInsetAdjustment = this.calculateNativeContentInsetAdjustment(contentInset);

        let pullToRefreshProgress = 0;
        let {horizontal, releaseToRefresh} = this.props;

        if (this.props.pullToRefreshDistance != null
          || this.state.refreshIndicatorEnd != null) {
            let scrollAxisInset = horizontal ? contentInset.left : contentInset.top;
            let scrollAxisOffset = horizontal ? contentOffset.x : contentOffset.y;
            let pullDistance = -(scrollAxisInset + scrollAxisOffset);
            let pullToRefreshDistance = this.props.pullToRefreshDistance
                ? this.props.pullToRefreshDistance
                : (this.state.refreshIndicatorEnd - scrollAxisInset) * 2;

            if (pullToRefreshDistance > 0) {
                pullToRefreshProgress = pullDistance / pullToRefreshDistance;
                pullToRefreshProgress = Math.max(Math.min(pullToRefreshProgress, 1), 0);
            }
            else {
                pullToRefreshProgress = 1;
            }
        }

        if (pullToRefreshProgress <= 0 && this.state.pullToRefreshProgress <= 0) {
            return;
        }

        if (releaseToRefresh) {
            this.setState({pullToRefreshProgress});
            return;
        }

        let wasRefreshing;
        this.setState(state => {
            let {tracking, refreshing, waitingToRest, returningToTop} = state;
            wasRefreshing = refreshing;
            let shouldBeginRefreshing = (pullToRefreshProgress === 1)
                && tracking && !refreshing && !waitingToRest && !returningToTop;
            return {
                pullToRefreshProgress,
                refreshing: state.refreshing || shouldBeginRefreshing
            };
        }, () => {
            if (!wasRefreshing && this.state.refreshing) {
                this.props.onRefreshStart(this.onRefreshEnd);
            }
        });

    },

    onResponderGrant(e) {
        if (this.props.onResponderGrant) {
            this.props.onResponderGrant(e);
        }
        this.setState({tracking: true});
    },

    onResponderRelease(e) {

        if (this.props.onResponderRelease) {
            this.props.onResponderRelease(e);
        }

        let newState = {tracking: false};

        let wasRefreshing = this.state.refreshing;
        if (this.props.releaseToRefresh && this.state.pullToRefreshProgress >= 1
          && !wasRefreshing && !this.state.waitingToRest && !this.state.returningToTop) {
            newState.refreshing = true;
        }

        this.setState(newState, () => {
            if (!wasRefreshing && this.state.refreshing) {
                this.props.onRefreshStart(this.onRefreshEnd);
            }
        });
    },

    onMomentumScrollEnd(e) {

        if (this.props.onMomentumScrollEnd) {
            this.props.onMomentumScrollEnd(e);
        }

        // Wait for the onResponderGrant handler to run in case the scroll ended
        // because the user touched a moving scroll view. requestAnimationFrame is
        // a crude but concise way to do this.
        this.requestAnimationFrame(() => {
            if (this.state.waitingToRest && !this.state.tracking) {
                this.restoreScrollView();
            }
        });
    },

    onRefreshEnd() {

        if (!this.state.refreshing && !this.props.releaseToRefresh) {
            return;
        }

        // Let the scroll view naturally bounce back to its resting position before
        // hiding the loading indicator if it is still pulled down or the user is
        // touching it
        let waitingToRest = this.state.tracking || this.isOverscrolled();
        this.setState({
            refreshing: false,
            waitingToRest
        });

        if (!waitingToRest) {
            this.restoreScrollView();
        }
    },

    isOverscrolled() {
        let {x, y} = this._nativeContentOffset;
        let distanceFromTop = this.props.horizontal
            ? x + this._nativeContentInset.left
            : y + this._nativeContentInset.top;
        return distanceFromTop < 0;
    },

    onRefreshIndicatorContainerLayout(e) {
        let {x, y, width, height} = e.nativeEvent.layout;
        let {horizontal} = this.props;
        let end = horizontal ? (x + width) : (y + height);
        this.setState({refreshIndicatorEnd: end});
    },

    restoreScrollView() {
        // Scroll up to the top to restore the scrollable content's position
        let scrollDestination = null;
        let {x, y} = this._nativeContentOffset;
        let {horizontal, contentInset} = this.props;
        let contentInsetLeft = contentInset && contentInset.left ? contentInset.left : 0;
        let contentInsetTop = contentInset && contentInset.top ? contentInset.top : 0;
        let contentInsetWithIndicator = this._scrollComponent.props.contentInset;
        if (horizontal) {
            let indicatorWidth = contentInsetWithIndicator.left - contentInsetLeft;
            let scrolledDistance = this._nativeContentInset.left + x;
            if (indicatorWidth > 0 && indicatorWidth > scrolledDistance) {
                let destinationX = Math.min(x, -this._nativeContentInset.left) + indicatorWidth;
                scrollDestination = [y, destinationX];
            }
        }
        else {
            let indicatorHeight = contentInsetWithIndicator.top - contentInsetTop;
            let scrolledDistance = this._nativeContentInset.top + y;
            if (indicatorHeight > 0 && indicatorHeight > scrolledDistance) {
                let destinationY = Math.min(y, -this._nativeContentInset.top) + indicatorHeight;
                scrollDestination = [destinationY, x];
            }
        }


        this.setState({
            refreshing: false,
            waitingToRest: false,
            returningToTop: !!scrollDestination,
            shouldIncreaseContentInset: false
        }, () => {
            if (scrollDestination) {
                this.scrollTo(...scrollDestination);
                // We (plan to) detect whether the scrolling has finished based on the scroll
                // position, but we must eventually set returningToTop to false since
                // we block user interactions while it is true
                this.clearTimeout(this._returningToTopSafetyTimeout);
                this._returningToTopSafetyTimeout = this.setTimeout(() => {
                    this._returningToTopSafetyTimeout = null;
                    this.setState({returningToTop: false});
                }, SCROLL_ANIMATION_DURATION_MS);
            }
        });
    }

});


styles = StyleSheet.create({
    container: {
        flex: 1
    },
    refreshIndicatorContainer: {
        backgroundColor: 'transparent',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center'
    },
    scrollComponent: {
        backgroundColor: 'transparent'
    }
});

export default RefreshableScrollView;
