/*
 * All JavaScript required for the theme has to be placed in this file
 * Use RequireJS define to import external JavaScript libraries
 * To be imported, a JavaScript has to be a module (AMD)
 * http://www.sitepoint.com/understanding-requirejs-for-effective-javascript-module-loading/
 * If this is not the case: place the path to the library at the end of the define array
 * Paths are relative to the app subfolder of the wp-app-kit plugin folder
 * You don't need to specify the .js extensions
    
 * (AMD) jQuery          available as    $
 * (AMD) Theme App Core  available as    App
 * (AMD) Local Storage   available as    Storage
 * (AMD) Template Tags   available as    TemplateTags
 * (AMD) App Config      available as    Config
 * (AMD) Moment 2.10.6   available as    Moment (http://momentjs.com/)
 * (AMD) Velocity 1.2.3  available as    Velocity (but used with jQuery) (http://julian.com/research/velocity/)
 *       FitVids (https://github.com/davatron5000/FitVids.js)
 */
define([
    'jquery',
    'core/theme-app',
    'core/modules/storage',
    'core/theme-tpl-tags',
    'root/config',
    'theme/js/moment.min',
    'theme/js/velocity.min',
    'theme/js/jquery.fitvids',
    'theme/js/my-search'
    ], function($,App,Storage,TemplateTags,Config,Moment,Velocity) {

    
    
    /*
     * App's parameters
     */
    
    App.setParam( 'go-to-default-route-after-refresh', false ); // Don't automatically show default screen after a refresh
    App.setParam( 'custom-screen-rendering', true ); // Don't use default transitions and displays for screens

    
    
    /*
     * Init
     */
    
    /**
     * @desc Customizing the iOS status bar to match the theme, relies on // https://build.phonegap.com/plugins/715
     */
    try { // Testing if the Cordova plugin is available
        StatusBar.overlaysWebView(false);
        StatusBar.styleLightContent();
        StatusBar.backgroundColorByHexString("#293E7E");
    } catch(e) {
        console.log("StatusBar plugin not available - you're probably in the browser");
    }

	// Global variables
    var isMenuOpen = false; // Stores if the off-canvas menu is currently opened or closed
    var lastPosts; // Last posts displayed at the bottom of posts (template parameter, see template-args filter)

    // Selector caching
    var $pullToRefreshArrow = $('#pull-to-refresh-arrow');
    var $pullToRefreshMessage = $('#pull-to-refresh-message');
    
    // Animated iOS spinner
    var spinner = $('<div class="spinner"><div class="bar1"></div><div class="bar2"></div><div class="bar3"></div><div class="bar4"></div><div class="bar5"></div><div class="bar6"></div><div class="bar7"></div><div class="bar8"></div><div class="bar9"></div><div class="bar10"></div><div class="bar11"></div><div class="bar12"></div></div>');
    
    // Launch pull to refresh animation loop
    animatePullToRefreshArrow();

    
    
    /*
     * Filters
     */
    
    // @desc Add template args
    App.filter( 'template-args', function( template_args, view_type, view_template ) {
        
        // Template parameters for single, page, archive and comments
        if (view_type == 'single' || view_type == 'page' || view_type == 'archive' || view_type == 'comments') {
            
            
            // Get Twitter like date format to single, archive and comments templates
            // Relies on MomentJS available as Moment()
            template_args.getCustomDate = function(postDate) {

                var gmtOffSetSec = Config.gmt_offset * 3600; // Get GMT offset as defined in config.js
                
                var momentNow = Moment(); // Get current date and time
                
                var momentPostDate = Moment(new Date((postDate-gmtOffSetSec)*1000)); // Get the post date

                // Get the duration between current date and the post date
                var diffDays = momentNow.diff(momentPostDate, 'days');
                
                var customPostDate;

                if (diffDays == 0) { // Duration is less than a day (eg. 8 hours ago)
                    customPostDate = momentPostDate.fromNow();
                } else { // Duration is more than a day (eg. March 3rd 2014)
                    // @todo: find a way to let dev localize date formats
                    customPostDate = momentPostDate.format('MMMM Do YYYY');
                }

                return customPostDate;
            }
            
            // Get last published posts collection
            // Last posts collection is retrieved on refresh:end event
            template_args.lastPosts = lastPosts;
        }
        
        // Return parameters and functions
        return template_args;
        
    } );

    // @desc Add custom transition keywords (aka directions) for:
    // transitions between single and comments
    // transitions between 2 singles
    App.filter( 'transition-direction', function( transition, current_screen, previous_screen ) {
    
        // Single to comments transition
        if ( previous_screen.screen_type == 'single' && current_screen.screen_type == 'comments' ) {
            transition = 'single-to-comments';
        }

        // Comments to single transition
        if ( previous_screen.screen_type == 'comments' && current_screen.screen_type == 'single' ) {
            transition = 'comments-to-single';
        }
        
        // Page to comments transition
        if ( previous_screen.screen_type == 'page' && current_screen.screen_type == 'comments' ) {
            transition = 'single-to-comments';
        }

        // Comments to age transition
        if ( previous_screen.screen_type == 'comments' && current_screen.screen_type == 'page' ) {
            transition = 'comments-to-single';
        }

        // Single to single transition
        if ( previous_screen.screen_type == 'single' && current_screen.screen_type == 'single' ) {
            transition = 'single-to-single';
        }
    
        // Return the current direction
        return transition;
        
    });

    // @desc Catch if we're going to a single and coming from a single (it is the case when clicking on a post in the last posts widget at the bottom of a post)
    // Update properly the history stack
    App.filter( 'make-history', function( history_action, history_stack, queried_screen, current_screen, previous_screen ) {

        if( queried_screen.screen_type === 'single' && current_screen.screen_type === 'single' ) {
            if ( queried_screen.item_id !== previous_screen.item_id ) { // Go from single to another single that is not the one we came from
                history_action = 'push';
            } else { // Come back to the previous single
                history_action = 'pop';
            }
        }
        
        // Return the proper history action
        return history_action;
    });


    
    /*
     * Actions
     */
    
    // @desc Detect transition types (aka directions) and launch corresponding animations
    App.action( 'screen-transition', function( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {

        // Get the direction keyword from current screen and  previous screen
        var direction = App.getTransitionDirection( current_screen, previous_screen );
        
        switch ( direction ) {
            case 'next-screen': // Archive to single
                transition_slide_next_screen( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            case 'previous-screen': // Single to archive
                transition_slide_previous_screen( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            case 'default': // Default direction
                transition_default( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            case 'single-to-comments': // Custom single to comments direction (set in transition-direction filter)
                transition_single_to_comments( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            case 'comments-to-single': // Custom comments to single direction (set in transition-direction filter)
                transition_comments_to_single( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            case 'single-to-single': // Custom single to single direction (set in transition-direction filter)
                transition_single_to_single( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
            default: // Unknown direction
                transition_default( $wrapper, $current, $next, current_screen, previous_screen, $deferred );
                break;
        }

    });

    
    
    /*
     * Transition animations
     */
    
    // @desc Archive to single animation
	transition_slide_next_screen = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {

        $wrapper.append($next); // Add the next screen to the DOM / Mandatory first action (notably to get scrollTop() working)

        // When transitioning from a list, memorize the scroll position in local storage to be able to find it when we return to the list
        if (previous_screen.screen_type == "list") {
            Storage.set("scroll-pos",previous_screen.fragment,$current.scrollTop()); // Memorize the current scroll position in local storage
        }

        // 1. Prepare next screen (the destination screen is not visible. We are before the animation)
        
        // Hide the single screen on the right
        $next.css({
            bottom: '44px', // Make room for the toolbar
			left: '100%'
		});

        // Compose the comments button label (in the toolbar)
        //setCommentsButton(current_screen);
        
        // Display the toolbar
        $("#app-toolbar").css({
            display: 'block'
        });

        // 2. Animate to display next screen
        
		// Slide screens wrapper from right to left
        $wrapper.velocity({
            left: '-100%'
        },{
            duration: 300,
            easing: 'ease-out',
            complete: function () {
                
                // remove the screen that has been transitioned out
				$current.remove();

				// remove CSS added specically for the transition
				$wrapper.attr( 'style', '' );

				$next.css({
				    left: '',
				});
                
				$deferred.resolve(); // Transition has ended, we can pursue the normal screen display steps (screen:showed)
            }
        });
	}

    // @desc Single to archive animation
	transition_slide_previous_screen = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {

        $wrapper.prepend($next); // Add the next screen to the DOM / Mandatory first action (notably to get scrollTop() working)
        
        // 1. Prepare next screen (the destination screen is not visible. We are before the animation)

        // Hide the archive screen on the left
		$next.css( {
			left: '-100%'
		} );

        // If a scroll position has been memorized in local storage, retrieve it and scroll to it to let user find its former position when he/she left
        if (current_screen.screen_type == "list") {
            var pos = Storage.get("scroll-pos",current_screen.fragment);
            if (pos !== null) {
                $next.scrollTop(pos);
            } else {
                $next.scrollTop(0);
            }
        }

        // Hide toolbar
        $("#app-toolbar").css({
            display: 'none'
        });

        // 2. Animate to display next screen

		// Slide screens wrapper from left to right
		$wrapper.velocity({
            left: '100%'
        },{
            duration: 300,
            easing: 'ease-out',
			complete: function () {

                // remove the screen that has been transitioned out
                $current.remove();

				// remove CSS added specically for the transition
                $wrapper.attr( 'style', '' );

                $next.css( {
                    left: '',
                } );
                
                $deferred.resolve(); // Transition has ended, we can pursue the normal screen display steps (screen:showed)
            }
        });
	}

    // @desc Single to comments animation
    transition_single_to_comments = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {
		
        // Display comment threads in the slideup panel
        $('#slideup-panel #panel-content').empty().append($next);

		// Slide UP the comments panel
        $('#slideup-panel').velocity({
            top: '0px'
        },{
            duration: 300,
            easing: 'ease-out',
            complete: function () {
                $deferred.resolve(); // Transition has ended, we can pursue the normal screen display steps (screen:showed)
            }
        });
	}

    // @desc Comments to single animation
    transition_comments_to_single = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {

		// Slide DOWN the comments panel
        $('#slideup-panel').velocity({
            top: '100%'
        },{
            duration: 300,
            easing: 'ease-out',
			complete: function () {
				$deferred.resolve(); // Transition has ended, we can pursue the normal screen display steps (screen:showed)
            }
        });
	}

    // @desc Single to single animation
    // Used when you click on one of the latest posts showed at the bottom of a post
    transition_single_to_single = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {

        // 1. Prepare next screen (the destination screen is not visible. We are before the animation)
        
        // Hide the single screen on the right
        $next.css({
            bottom: '44px' // Make room for the toolbar
		});

        // Compose the comments button label (in the toolbar)
        setCommentsButton(current_screen);
        
        // 2. Animate to display next screen
        
		// Simply replace current screen with the new one
        $current.remove();
		$wrapper.empty().append( $next );
		$deferred.resolve();

	}

    // @desc Default animation
    // Also used when the direction is unknown
	transition_default = function ( $wrapper, $current, $next, current_screen, previous_screen, $deferred ) {
		
		// Simply replace current screen with the new one
        $current.remove();
		$wrapper.empty().append( $next );
		$deferred.resolve();
        
	};

    
    
	/**
     * App Events
     */

    // @desc Refresh process begins
	App.on('refresh:start',function(){

        // Hide the pull to refresh arrow
        hidePullToRefreshArrow();
        
        // Display the pull to refresh message (in layout.html)
        $pullToRefreshMessage.css({
            opacity: 1
        });

		// Start refresh icon animation
        $("#refresh-button").removeClass("refresh-off").addClass("refresh-on");
        
	});
     
    // @desc Refresh process ends
    // @param result
	App.on('refresh:end',function(result){

        // Navigate to the default screen
        App.navigateToDefaultRoute();

        Storage.clear('scroll-pos');    // Clear the previous memorized position in the local storage
        
		// The refresh icon stops to spin
		$("#refresh-button").removeClass("refresh-on").addClass("refresh-off");
		
		// Select the current screen item in off-canvas menu
        $("#menu-items li").removeClass("menu-active-item");
		$("#menu-items li:first-child").addClass("menu-active-item");
		
		/**
         * Display if the refresh process is a success or not
         * @todo if an error occurs we should not reset scroll position
         * @todo messages should be centralized to ease translations
         */
		if ( result.ok ) {
			showMessage("Contenu mis à jour avec succès");
		}else{
			showMessage(result.message);
		}

        // Hide the pull to refresh message (in layout.html)
        // @todo: better handle the case where the scrollTop < 0
        $pullToRefreshMessage.css({
            opacity: 0
        });

        // Show the pull to refresh arrow
        $pullToRefreshArrow.css({
            bottom: '0px',
            opacity: 1
        });

        // Get the last 3 published posts
        // Will be used later to display last published posts at the bottom of the posts
        lastPosts = getLastPosts(3);
        
    });

    // @desc An error occurs
    // @param error
	App.on('error',function(error){
        
        // Show message under the nav bar
        showMessage(error.message);

        // Hide the pull to refresh message (in layout.html)
        // @todo: create a function to hide/show the pull to refresh elements
        $pullToRefreshMessage.css({
            opacity: 0
        });

        // Show the pull to refresh arrow
        $pullToRefreshArrow.css({
            bottom: '0px',
            opacity: 1
        });
        
	});

    // @desc A screen has been displayed
    // @param {object} current_screen - Screen types: list|single|page|comments
    // @param view
    App.on('screen:showed',function(current_screen,view){
    	
    	//Search
    	if(current_screen.screen_type == "single") {
    		$("#search-button").css("display","none");
    	} else {
    		$("#search-button").css("display","block");
    	}
    	
        /*
         * 1. Pull to refresh
         */
        
        // Cache the current screen element
        var $appScreen = $('.app-screen');
        
        // .app-screen scroll event handler
        // here because no event delegation is possible for the scroll event
        $appScreen.on('scroll',function(e){
            
            // Get the scroll position
            var scrollTop = $appScreen.scrollTop();

            // The scroll position is negative
            // Possible because of the iOS rubber band behavior
            if (scrollTop < 0) {
                
                // Switch to a transparent background to be able to see pull to refresh elements
                // @todo Better use classes
                if ($appScreen.css('background-color') == 'rgb(255, 255, 255)') {
                    $appScreen.css({
                        'background-color': 'transparent'
                    });
                    
                }
                
                // Trigger refresh
                // Threshold: 80px
                if (scrollTop < -80 && !App.isRefreshing()) {
                    refreshTapOff(e);                    
                }
                
            } else {
                
                // Switch to a white background when not using pull to refresh
                if ($appScreen.css('background-color') == 'rgba(0, 0, 0, 0)') {
                    $appScreen.css({
                        'background-color': '#fff'
                    });
                }

            }

        });
        
        /*
         * 2. Back button
         */
        
        // Show/Hide back button depending on the displayed screen
        if (TemplateTags.displayBackButton()) {
            $("#back-button").css("display","block");
			$("#menu-button").css("display","none");
        } else {
            $("#back-button").css("display","none");
			$("#menu-button").css("display","block");
        }

        /*
         * 3. Off canvas menu
         */
        
        // Close off-canvas menu
        if (isMenuOpen) {
			$("#app-canvas").css("left","85%"); 
			closeMenu();
		}

        /*
         * 4. Post list
         */
        
        if(current_screen.screen_type == "list") {

            // Change nav bar title (display the component label)
            // Todo: create a generic function
            if ( $('#app-header > h1').html() != current_screen.label ) {
                $('#app-header > h1').html(current_screen.label);
            }
            
            // Scroll position is handled in the preparation of the transition (transition_slide_previous_screen)
        }

		/*
         * 5. Single and page
         */
        

        // Get and store data necessary for the sharing
            
        if (current_screen.screen_type=="single") {
            
            $('#share-button').attr('data-url',current_screen.data.post.permalink);
            $('#share-button').attr('data-title',current_screen.data.post.title);
            $('#share-button').attr('data-image',current_screen.data.post.thumbnail.src);
            
            // Change nav bar title
            // Todo: create a generic function
            if ( $('#app-header > h1').html() != 'Détail de l\'événement' ) {
                $('#app-header > h1').html('Détail de l\'événement');
            }
        }

        if (current_screen.screen_type=="page") {
            
            $('#share-button').attr('data-url',current_screen.data.item.permalink);
            $('#share-button').attr('data-title',current_screen.data.item.title);
            $('#share-button').attr('data-image',current_screen.data.item.thumbnail.src);
            
            // Change nav bar title
            // Todo: create a generic function
            if ( $('#app-header > h1').html() != '' ) {
                $('#app-header > h1').html('');
            }

            $('.app-screen').css({
                bottom: '44px', // Make room for the toolbar
            });

            // Compose the comments button label (in the toolbar)
            setCommentsButton(current_screen);

            // Display the toolbar
            $("#app-toolbar").css({
                display: 'block'
            });

        }
                        
        if (current_screen.screen_type=="single" || current_screen.screen_type=="page") {

            // Redirect all content hyperlinks clicks
            // @todo: put it into prepareContent()
            $("#app-layout").on("click", ".single-content a", openInBrowser);
            
            // Make any necessary modification to post/page content
            prepareContent();
            
            // Display videos and make them responsive
            // We defer video loading to keep transitions smooth
            loadAndFormatVideos();

		}

        /*
         * 6. Comments
         */
        
        if (current_screen.screen_type == "comments") {

            // Hide the spinner in the comments button
            $("#comments-button a .spinner").remove();
            
            // Open all hyperlinks in comments in a inapp browser
            $("#app-layout").on("click",".comments-template a",openInBrowser);
            
        }
        
	});

    // @desc About to leave the current screen
    // @param {object} current_screen - Screen types: list|single|page|comments
    // @param queried_screen
    // @param view
	App.on('screen:leave',function(current_screen,queried_screen,view){

        /*
         * 1. Single or page
         */
        
        if (current_screen.screen_type == 'single' || current_screen.screen_type == 'page') {
            
            // Unset data necessary for sharing
            $('#share-button').attr('data-url','').attr('data-title','').attr('data-image','');

        }
        
        if (current_screen.screen_type == 'page') {
        
            // Hide toolbar
            $("#app-toolbar").css({
                display: 'none'
            });
            
        }
        
        // Unbind .app-screen scroll event (bind in screen:showed)
        // Scroll is notably used for pull to refresh
        $('.app-screen').off('scroll');
        
    });

    // @desc Catch when the device goes online
    // relies on https://github.com/apache/cordova-plugin-network-information
    // Possible values:
    // * Unknown connection
    // * Ethernet connection
    // * WiFi connection
    // * Cell 2G connection
    // * Cell 3G connection
    // * Cell 4G connection
    // * Cell generic connection
    // * No network connection
    App.on('network:online', function(event){
        
        // Get the current network state
        var ns = TemplateTags.getNetworkState(true);
        
        // Display the current network state
        showMessage(ns);
    });

    // @desc Catch when the device goes offline
    // @desc Catch when the device goes online
    // relies on https://github.com/apache/cordova-plugin-network-information
    // Possible values:
    // * Unknown connection
    // * Ethernet connection
    // * WiFi connection
    // * Cell 2G connection
    // * Cell 3G connection
    // * Cell 4G connection
    // * Cell generic connection
    // * No network connection
    App.on( 'network:offline', function(event){

        // Get the current network state
        var ns = TemplateTags.getNetworkState(true);

        // Display the current network state
        showMessage(ns);
    });

    
      
    /*
     * Event bindings
     * All events are bound to #app-layout using event delegation as it is a permanent DOM element
     * They became available as soon as the target element is available in the DOM
     * Single and page content click on hyperlinks bindings are done in screen:showed
     * .app-screen scroll event binding is done in screen:showed because event delegation is not possible for this kind of event
     */

    // Menu Button events
    $("#app-layout").on("touchstart","#menu-button",menuButtonTapOn);
	$("#app-layout").on("touchend","#menu-button",menuButtonTapOff);

    // Refresh Button events
    $("#app-layout").on("touchstart","#refresh-button",refreshTapOn);
	$("#app-layout").on("touchend","#refresh-button",refreshTapOff);

	// Search Button events
    $("#app-layout").on("click","#search-button",searchTapOn);
	
    // Menu Item events
	$("#app-layout").on("click","#menu-items li a",menuItemTap);
	$("#app-layout").on("click","#content .content-item a",contentItemTap);

	// Back button events
    $("#app-layout").on("touchstart","#back-button",backButtonTapOn);

    // Comments button events
//    $("#app-layout").on("touchstart","#comments-button",commentsButtonTapOn);
//    $("#app-layout").on("touchend","#comments-button",commentsButtonTapOff);
    
//    // Add to calendar button events
    $("#app-layout").on("click","#calendar-button",calendarButtonTapOn);

    // Share button events
    $("#app-layout").on("touchstart","#share-button",shareButtonTapOn);
    $("#app-layout").on("touchend","#share-button",shareButtonTapOff);
    
    // Close slideup panel button events
    $("#app-layout").on("touchstart","#close-panel-button",closePanelButtonTapOn);
    $("#app-layout").on("touchend","#close-panel-button",closePanelButtonTapOff);

    // Block clicks on images in posts
    $("#app-layout").on("click touchend","#single-content .content-image-link",function(e){e.preventDefault();});
    
    // .scroll-top class is used in the latest posts list at the bottom of posts
    // It is used when the clicked post is the same as the currently displayed post
    $("#app-layout").on("touchend",".scroll-top",function() {$('.app-screen').scrollTop(0);});

    // Statusbar tap
    // Relies on https://www.npmjs.com/package/phonegap-statusbar-tap
    $(window).on("statusbarTap", scrollTopOnStatusBarTap);

    // Get more button events
    $( '#app-layout' ).on( 'touchend', '#get-more-button', getMoreButtonTapOff);
    
    /*
     * @desc Display default image if an error occured when loading an image element (eg. offline)
     * 1. Binding onerror event doesn't seem to work properly in functions.js
     * 2. Binding is done directly on image elements
     * 3. You can't use UnderscoreJS tags directly in WordPress content. So we have to attach an event to window.
     * 4. Content image onerror handlers are set in prepare-content.php
     * 5. Thumbnail event handlers are done in the templates archive.html and single.html
     */
    window.displayDefaultImage = function(o) {
        $(o).attr('src',TemplateTags.getThemeAssetUrl('img/img-icon.svg'));
    }

    
    
    /*
     * Functions
     */

    /*
     * 1. Off canvas menu
     */

    // @desc Open off-canvas menu
    function openMenu() {

		$("#menu-items").css("display","block");
        
        $("#app-canvas").velocity({
			left:"85%",

        }, {
            duration: 300,
            complete: function() {
				setTimeout(function(){
                    isMenuOpen=true;
                },150);
			}
        });    
    }

    // @desc Close off-canvas menu
    // @param action (1 means that we close the off-canvas menu after clicking on a menu item)
    // @param menuItem
	function closeMenu(action,menuItem) {

		isMenuOpen = false;

        $("#app-canvas").velocity({
			left:"0",
		},300, function() {

            $("#menu-items").css("display","none");

            // We have tapped a menu item, let's open the corresponding screen
            if (action==1) {
                App.navigate(menuItem.attr("href"));
            }

        });
	}

    // @desc Open or close off-canvas menu (based on isMenuOpen variable)
	function toggleMenu() {  
		if (isMenuOpen) {
			closeMenu();
		} else {
 			openMenu();
		}
	}

    // @desc Finger presses the menu button
	function menuButtonTapOn(e) {
        e.preventDefault();
        $("#menu-button").removeClass("button-tap-off").addClass("button-tap-on"); // Switch icon state (on)
	}

    // @desc Finger releases the menu button
	function menuButtonTapOff(e) {
        e.preventDefault();
		$("#menu-button").removeClass("button-tap-on").addClass("button-tap-off"); // Switch icon state (off)
		toggleMenu(); // Open or close off-canvas menu
	}

    // @desc Finger taps one of the off-canvas menu item
	function menuItemTap(e) {	

        e.preventDefault();
        
		if (isMenuOpen) {

			// Select tapped item
            $("#menu-items li").removeClass("menu-active-item"); // Unselect all menu items
			$(this).closest("li").addClass("menu-active-item");

            // Close menu and navigate to the item's corresponding screen
            // @todo use navigate here rather than in close menu
			closeMenu(1,$(this));
            
		}

	}

    // @desc Finger taps one of the post item in a post list
	function contentItemTap(e) {

        e.preventDefault();
        
		if (!isMenuOpen) {
			App.navigate($(this).attr("href")); // Display post
		} else {
			closeMenu(); // Tapping a post item when the off-canvas menu is opened closes it
		}
	}

    /*
     * 2. Message bar
     */

    // @desc Show a message in the message bar during 3 sec
	function showMessage(msgText) {
		$("#app-message-bar").html(msgText);
		$("#app-message-bar").removeClass("message-off").addClass("message-on");
		setTimeout(hideMessage,3000);
	}

    // @desc Hide the message bar
	function hideMessage() {
		$("#app-message-bar").removeClass("message-on").addClass("message-off");	
		$("#app-message-bar").html("");
	}

    /*
     * 3. Refresh button
     */
        
    // @desc Finger taps the refresh button
	function refreshTapOn(e) {
        e.preventDefault();
        $("#refresh-button").removeClass("button-touch-off").addClass("button-touch-on");
	}

    // @desc Finger releases the refresh button
	function refreshTapOff(e) {
        e.preventDefault();
        if (!App.isRefreshing()) { // Check if the app is not already refreshing content
			$("#refresh-button").removeClass("button-touch-on").addClass("button-touch-off");
			$("#refresh-button").removeClass("refresh-off").addClass("refresh-on");
			App.refresh(); // Refresh content
		}
	}

    // @desc Stop spinning when refresh ends
	function stopRefresh() {
		$("#refresh-button").removeClass("refresh-on").addClass("refresh-off");	
	}
	
	function searchTapOn(e) {
		e.preventDefault();
		$("#filter-form").fadeToggle(300);
	}

    /*
     * 4. Back button
     */

    // @desc Finger taps the back button
    function backButtonTapOn(e) {
        e.preventDefault();
		$("#back-button").removeClass("button-tap-off").addClass("button-tap-on");
	}

    // @desc Finger releases the back button
    function backButtonTapOff(e) {
		e.preventDefault();
        $("#back-button").removeClass("button-tap-on").addClass("button-tap-off");
        App.navigate(TemplateTags.getPreviousScreenLink()); // Navigate to the previous screen using the history stack
	}

    /*
     * 5. More button
     */

    // @desc Finger releases the get more button
    function getMoreButtonTapOff(e) {

        e.preventDefault();
        
        // Disable the Get more button and show spinner
        $('#get-more-button').attr('disabled','disabled');
        $("#get-more-button").append(spinner);

        // Get the next posts
        App.getMoreComponentItems(
            function() {

                // On success, hide spinner and activate the Get more button
                $("#get-more-button .spinner").remove();
                $('#get-more-button').removeAttr('disabled');

            }, function(error, get_more_link_data) {

                // On error, hide spinner and activate the Get more button
                // @todo: fire a specific message
                $("#get-more-button .spinner").remove();
                $('#get-more-button').removeAttr('disabled');
                
            }
        );
    }

    /*
     * 6. Comments button
     */
    
//    // @desc set comments button label
//    function setCommentsButton(current_screen) {
//
//        var screenData;
//        
//        if (current_screen.screen_type == 'single') {
//            screenData = current_screen.data.post;
//        }
//        
//        if (current_screen.screen_type == 'page') {
//            screenData = current_screen.data.item;            
//        }
//        
//        $('#comments-button').attr('post-id',screenData.id);
//        
//        var nbComments = screenData.nb_comments;
//        var commentsLabel = nbComments + " commentaire"; // Default singular label
//        
//        if (nbComments > 0) { // If post has comments
//            
//            $('#comments-button').attr('has-comments','true');
//            
//            // Handle plural label if there's more than one comment
//            if (nbComments > 1) {
//                commentsLabel += "s";
//            }
//            
//            // @todo: change to span with dedicated class
//            commentsLabel = '<a>' + commentsLabel + '</a>';
//            
//        } else { // No comments label
//            $('#comments-button').attr('has-comments','false');
//            commentsLabel = '<span  class="no-comment">' + commentsLabel + '</span>';
//        }
//
//        // Display comments label
//        $("#comments-button").empty().html(commentsLabel); 
//
//    }
    
    // @desc Finger taps the close button
    function closePanelButtonTapOn(e) {
        e.preventDefault();
        $("#close-panel-button").removeClass("button-tap-off").addClass("button-tap-on"); // Switch icon state (on)
    }
    
    // @desc Finger releases the close button
    function closePanelButtonTapOff(e) {
        e.preventDefault();
        $("#close-panel-button").removeClass("button-tap-on").addClass("button-tap-off"); // Switch icon state (off)
        App.navigate(TemplateTags.getPreviousScreenLink()); // Navigate to the previous screen (post)
    }
    
    // @desc Finger taps the comments button
    function commentsButtonTapOn(e) {
        
        e.preventDefault();
        
        if ($(this).attr('has-comments') == 'true') {
            $("#comments-button a").append(spinner); // display spinner
        }
    }
    
    // @desc Finger releases the comments button
    function commentsButtonTapOff(e) {

        e.preventDefault();
                
        if ($(this).attr('has-comments') == 'true') {
            App.displayPostComments( // Display comments
                $(this).attr('post-id'),
                function( comments, post, item_global ) {
                    // Success callback
                },
                function( error ){
                    // Error callback
                    $("#comments-button a .spinner").remove(); // Hide spinner
                    showMessage(error.message); // Show error in message bar
                }
            );
        }
    }


    /*
     * 7. Pull to refresh
     */

    // @desc Pull to refresh animation loop
    function animatePullToRefreshArrow() {

        $('#pull-to-refresh-arrow img').velocity({
            top: "+=5px"
        },{
            loop: true,
            complete: function(){
                $pullToRefreshArrow.velocity('reverse');
            }
        });

    }
    
    // @desc Animation to hide the pull to refresh arrow
    function hidePullToRefreshArrow(){

        $pullToRefreshArrow.velocity({
            bottom: '56px',
            opacity: 0
        },{
            duration: 300
        });
        
    }

    /*
     * 8. Status bar
     */
    
    // @desc Scroll on status bar tap
    function scrollTopOnStatusBarTap() {

        var target = $(".app-screen");

        // Don't scroll if we're already at the top of the screen
        if (target.scrollTop() > 0) {

            // Disable touch scroll to kill existing inertial movement
            target.css({
                '-webkit-overflow-scrolling' : 'auto',
                'overflow-y' : 'hidden'
            });

            // Scroll up
            // You can't use VelocityJS to animate
            // Use jQuery instead
            target.animate({ scrollTop: 0}, 300, "swing", function(){

                // Re-enable touch scrolling
                target.css({
                    '-webkit-overflow-scrolling' : 'touch',
                    'overflow-y' : 'scroll'
                });
            });

        }

    }

    /*
     * 9. Share button
     */
    
    // @desc Finger taps the share button
    function shareButtonTapOn(e) {
        e.preventDefault();
        $("#share-button").removeClass("button-tap-off").addClass("button-tap-on"); // Switch icon state (on)
        $("#app-layout").removeClass("blur-off").addClass("blur-on"); // Blur background
    }

    // @desc Finger releases the share button
    function shareButtonTapOff(e) {

        e.preventDefault();

        $("#share-button").removeClass("button-tap-on").addClass("button-tap-off"); // Switch icon state (off)

        // Get data to be shared (message including URL, subject and image)
        var message = "Je pense que cet article pourrait vous intéresser";
        if ($(this).attr('data-url') != '') {
            message = ": " + $(this).attr('data-url');
        } else {
            message = '.';
        }
        
        var subject = '';
        if ($(this).attr('data-title') != '') {
            subject = $(this).attr('data-title');
        } else {
            subject = null;
        }

        // @todo: preload image to speed up the sharing display
        // @todo: detect 2G to bypass the image download
        var imageUrl = '';
        if ($(this).attr('data-image') != '') {
            imageUrl = $(this).attr('data-image');
        } else {
            imageUrl = null;
        }
                
        // Launch OS sharing center (and check if the necessary Phonegap plugin is available - https://github.com/EddyVerbruggen/SocialSharing-PhoneGap-Plugin/)
        try {
            window.plugins.socialsharing.share(
                message, // Message
                subject, // Subject
                imageUrl, // Image
                null, // Link
                function(result) { $("#app-layout").removeClass("blur-on").addClass("blur-off");}, // Success feedback
                function(result) { $("#app-layout").removeClass("blur-on").addClass("blur-off");}  // Error feedback
            );
        } catch(e) {
            console.log("Sharing plugin is not available - you're probably in the browser");
            $("#app-layout").removeClass("blur-on").addClass("blur-off");
        }
 
    }
    
    /*
     * 10. Content
     */
    
    // @desc Prepare content for proper display / Part of the work is done in /php/prepare-content.php
	function prepareContent() {
        
        // Modify embedded tweets code for proper display
        // Note: it is not possible to style embedded tweet in apps as Twitter doesn't identify the referer
        $(".single-template blockquote.twitter-tweet p").css( "display", "inline-block" );
	
    }
    
    // @desc Hyperlinks click handler
    // Relies on the InAppBrowser Cordova Core Plugin / https://build.phonegap.com/plugins/233
    // Target _blank calls an in app browser (iOS behavior)
    // Target _system calls the default browser (Android behavior)
    // @param {object} e
    function openInBrowser(e) {
        
        try {
            cordova.InAppBrowser.open(e.target.href, '_blank', 'location=yes');    
        } catch(e) {
            window.open(e.target.href, '_blank', 'location=yes');
        }

        e.preventDefault();
    }

    // @desc Load videos / launched after transitions to keep them smooth
    // data-src are filled and src emptied in /php/prepare-content.php
    // We use the fitVids library to make videos responsive (https://github.com/davatron5000/FitVids.js)
    function loadAndFormatVideos() {

        $("iframe").each(function(index) {
            if ($(this).attr('data-src')) {
                $(this).attr('src', $(this).attr('data-src'));
            }
        });
        
        $('#single-content').fitVids();

    }
    
    // @desc Get last 3 published posts
    // Will be displayed at the bottom of posts
    // Launched on refresh:end
    function getLastPosts( nb_posts ) {
        
        //Get all posts in local storage (Backbone collection)
        var all_post_models = App.getItems();

        //Sort collection by date
        all_post_models.comparator = 'date';
        all_post_models.sort();

        //Get the last 3 and reverse order to order by date desc
        var last_post_models = all_post_models.last( nb_posts ).reverse();

        //Retrieve JSON post objects out of Backbone models
        var last_posts = _.map( last_post_models, function( model ){ return model.toJSON(); } );

        return last_posts;
        
	}
    
    /*
     * 11. Add to Calendar button
     */
    
    // @desc Finger taps the calendar button
    function calendarButtonTapOn(e) {
        e.preventDefault();

        var title = $("#add-to-calendar").attr('data-title');
        var notes = '';
        var eventLocation = $("#add-to-calendar").attr('data-location');
        var startDate = new Date($("#add-to-calendar").attr('data-start-date'));
        startDate = startDate.toUTCString();
        
        if ($("#add-to-calendar").attr('data-end-date')) {
        	var endDate = new Date($("#add-to-calendar").attr('data-end-date'));
        	endDate = endDate.toUTCString();
        } else {
        	var endDate = new Date($("#add-to-calendar").attr('data-start-date'));
        	endDate = endDate.toUTCString();
        }
       
        if (startDate && endDate) {
        	alert(startDate);
        	window.plugins.calendar.createEventInteractively(title,eventLocation,notes,startDate,endDate);
        }
    }
});