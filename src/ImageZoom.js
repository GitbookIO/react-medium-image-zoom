import React, { Component } from 'react'
import { bool, func, object, shape, string } from 'prop-types'
import defaults from './defaults'
import { isMaxDimension } from './helpers'
import { isEnterOrSpaceBarKey } from './keyboardEvents'

import EventsWrapper from './EventsWrapper'
import Zoom from './Zoom'

const isControlled = isZoomed => isZoomed !== null && isZoomed !== undefined
const focusableTabIndex = 0
const unfocusableTabIndex = -1

export default class ImageZoom extends Component {
  constructor(props) {
    super(props)

    this.state = {
      isDisabled: false,
      isZoomed: false,
      wasZoomed: false,
      src: props.image.src,
      prevSrc: props.image.src,
      isClosing: false
    }

    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleLoad = this._handleLoad.bind(this)
    this._handleLoadError = this._handleLoadError.bind(this)
    this._handleUnzoom = this._handleUnzoom.bind(this)
    this._handleZoom = this._handleZoom.bind(this)
  }

  static get defaultProps() {
    return {
      shouldReplaceImage: true,
      shouldRespectMaxDimension: false,
      zoomMargin: 40,
      defaultStyles: {
        zoomContainer: {},
        overlay: {},
        image: {},
        zoomImage: {}
      },
      shouldHandleZoom: () => true,
      onZoom: () => {},
      onUnzoom: () => {}
    }
  }

  static getDerivedStateFromProps(props, state) {
    /**
     * When component is controlled, we need a flag
     * set when it's about to close in order to keep
     * hiding the original image on the page until the
     * unzooming is complete
     */
    const isClosing = state.wasZoomed && !props.isZoomed || state.isClosing
    // If the consumer wants to change the image's src, then so be it.
    const src = props.image.src !== state.prevSrc ? props.image.src : state.src

    return {
      src,
      isClosing,
      // Keep track of previous props
      wasZoomed: props.isZoomed,
      prevSrc: props.image.src
    }
  }

  /**
   * When the component's state updates, check for changes
   * and either zoom or start the unzoom procedure.
   * NOTE: We need to differentiate whether this is a
   * controlled or uncontrolled component and do the check
   * based off of that.
   */
  componentDidUpdate(prevProps, prevState) {
    if (
      !isControlled(prevProps.isZoomed) &&
      isControlled(this.props.isZoomed)
    ) {
      throw new Error(defaults.errors.uncontrolled)
    } else if (
      isControlled(prevProps.isZoomed) &&
      !isControlled(this.props.isZoomed)
    ) {
      throw new Error(defaults.errors.controlled)
    }

    const prevIsZoomed = isControlled(prevProps.isZoomed)
      ? prevProps.isZoomed
      : prevState.isZoomed
    const isZoomed = isControlled(this.props.isZoomed)
      ? this.props.isZoomed
      : this.state.isZoomed
    if (prevIsZoomed !== isZoomed && !isZoomed && this.portalInstance) {
      this.portalInstance.unzoom({ force: true })
    }
  }

  render() {
    const {
      props: {
        defaultStyles,
        image,
        isZoomed: propsIsZoomed,
        shouldRespectMaxDimension,
        zoomImage,
        zoomMargin
      },
      state: { isDisabled, isZoomed: stateIsZoomed, src, isClosing }
    } = this

    /**
     * Take whatever attributes you want to pass the image
     * and then override with the properties we need,
     * including using state as source of truth for hi/low-res
     * version img src.
     * Also, disable any clicking if the component is
     * already at its maximum dimensions.
     */
    const attrs = Object.assign(
      {},
      !isDisabled && { tabIndex: focusableTabIndex },
      image,
      { src, style: this._getImageStyle() },
      !isDisabled && {
        onMouseDown: this._preventFocus,
        onClick: this._handleZoom,
        onKeyDown: this._handleKeyDown
      }
    )
    const isZoomed = isControlled(propsIsZoomed) ? propsIsZoomed : stateIsZoomed

    return [
      <img
        {...attrs}
        key="image"
        ref={x => {
          this.image = x
        }}
        onLoad={this._handleLoad}
        onError={this._handleLoadError}
      />,
      this.image && (isZoomed || isClosing) ?
        <EventsWrapper
          key="portal"
          ref={node => {
            this.portalInstance = node
          }}
          controlledEventFn={this._getControlledEventFn()}
          allowAccessibilityClose={this._allowTabNavigation()}
        >
          <Zoom
            defaultStyles={defaultStyles}
            image={this.image}
            shouldRespectMaxDimension={shouldRespectMaxDimension}
            zoomImage={zoomImage}
            zoomMargin={Number(zoomMargin)}
            onUnzoom={this._handleUnzoom}
          />
        </EventsWrapper>
       : null
    ]
  }

  /**
   * If the image should not exceed its original
   * dimensions AND there is no zoomImage AND the
   * image is already rendered at its maximum dimensions,
   * then we shouldn't try to zoom it at all. We currently
   * only do this on componentDidMount, though on window
   * resize could be something to consider if necessary.
   */
  _checkShouldDisableComponent() {
    const { shouldRespectMaxDimension, zoomImage } = this.props
    const isDisabled =
      shouldRespectMaxDimension && !zoomImage && isMaxDimension(this.image)

    this.setState({ isDisabled })
  }

  _getImageStyle() {
    const {
      props: { defaultStyles, image, isZoomed: isZoomedP },
      state: { isDisabled, isZoomed: isZoomedSt, isClosing }
    } = this

    const isHidden = isZoomedSt || isZoomedP || isClosing

    return Object.assign(
      {},
      defaults.styles.image,
      isHidden && { visibility: 'hidden' },
      defaultStyles.image,
      image.style,
      isDisabled && { cursor: 'inherit' }
    )
  }

  /**
   * We need to wait for the main image
   * to load before we can do any width/height
   * checks on it.
   */
  _handleLoad(e) {
    this._checkShouldDisableComponent()

    const cb = this.props.image.onLoad || Function.prototype
    cb(e)
  }

  _handleLoadError(e) {
    this.setState({ isDisabled: true })

    const cb = this.props.image.onError || Function.prototype
    cb(e)
  }

  _handleKeyDown(e) {
    if (isEnterOrSpaceBarKey(e)) {
      e.preventDefault()
      this._handleZoom(e)
    }
  }

  _preventFocus(e) {
    e.preventDefault()
  }

  _handleZoom(e) {
    if (!isControlled(this.props.isZoomed) && this.props.shouldHandleZoom(e)) {
      this.setState({ isZoomed: true }, this.props.onZoom)
    } else {
      this.props.onZoom()
    }
  }

  /**
   * This gets passed to the zoomed component as a callback
   * to trigger when the time is right to shut down the zoom.
   * If `shouldReplaceImage`, update the normal image we're showing
   * with the zoomed image -- useful when wanting to replace a low-res
   * image with a high-res one once it's already been downloaded.
   * It also cleans up the zoom references and then updates state.
   */
  _handleUnzoom(src, allowRefocus) {
    return () => {
      const changes = Object.assign(
        { isZoomed: false, isClosing: false },
        this.props.shouldReplaceImage && { src }
      )

      this.setState(changes, this.props.onUnzoom)

      if (allowRefocus && this._allowTabNavigation()) {
        this.image.focus()
      }
    }
  }

  _getControlledEventFn() {
    return isControlled(this.props.isZoomed) ? this.props.onUnzoom : null
  }

  _allowTabNavigation() {
    return this.image && this.image.tabIndex !== unfocusableTabIndex
  }
}

ImageZoom.propTypes = {
  image: shape({
    src: string.isRequired,
    alt: string,
    className: string,
    style: object
  }).isRequired,
  zoomImage: shape({
    src: string,
    alt: string,
    className: string,
    style: object
  }),
  defaultStyles: object,
  isZoomed: bool,
  shouldHandleZoom: func,
  shouldReplaceImage: bool,
  shouldRespectMaxDimension: bool,
  onZoom: func,
  onUnzoom: func
}
