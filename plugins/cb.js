/**
\file cb.js
A plugin for measuring chartbeat performance and sending stats to your
chartbeat publishing dashboard. Specifically, the plugin does 3 things:

Sends Boomerang data to chartbeat. Users may choose what stats to send in
the config, by default it is basic round trip data and chartbeat data
(see below). This data will showup in the Chartbeat Publishing realtime
api.

Measure chartbeat performance. It measures load and request duration of  the
chartbeat script, as well as load and request duration of the first  chartbeat
beacon request. Request durations require support of the resources timing api.
As of this writing, is it supported By all the major browsers except Safari
(http://caniuse.com/#search=resource%20timing)

The plugin will also replace the User Page Load metric in Chartbeat for
Everyone with the Boomerang t_done metric which is generally more accurate
and does not require JS at the top of the page.

Copyright (c) 2015 Chartbeat Inc. All Rights Reserved.

Licensed under Apache License V2:
https://opensource.org/licenses/Apache-2.0

THIS SOFTWARE IS PROVIDED BY Chartbeat "AS IS" AND ANY EXPRESS OR IMPLIED
WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
*/

// w is the window object
(function(w) {

var d = w.document;

// First make sure BOOMR is actually defined.  It's possible that your
// plugin is loaded before boomerang, in which case
// you'll need this.
BOOMR = BOOMR || {};
BOOMR.plugins = BOOMR.plugins || {};

// A private object to encapsulate all the implementation details
var impl = {
  // Boomerang vars to send, defaults listed below
  sendVars: [
    't_done',
    't_page',
    't_resp',
    'cb.js.load',
    'cb.js.dur',
    'cb.ping1.load',
    'cb.ping1.dur'
    ],
  _is_complete: false,
  _timedLoads: {},
  _pageLoadTime: 0,

  /**
   * Sends designated Boomerang variable to Chartbeat as custom vars
   * @param vars object which contains all parameters that will be
   *    added to the beacon
   */
  updateCbVars: function(vars) {
    BOOMR.debug(
        'updateCbVars: '.concat(BOOMR.utils.objectToString(vars)), 'cb');
    // set pageLoadTime for pinger
    impl._pageLoadTime = vars.t_done;

    // Get resource timings if available
    if (window.performance && window.performance.getEntries) {
      var entries = window.performance.getEntries('resource');
      var elen = entries.length;
      for (var e = 0; e < elen; e++) {
        var recorder;
        if (recorder = impl._timedLoads[entries[e].name]) {
          console.log(entries[e]);
          if (entries[e].duration) {
            BOOMR.addVar(recorder.id + '.dur', Math.round(entries[e].duration));
          }
          if (entries[e].domainLookupStart && entries[e].domainLookupEnd) {
            BOOMR.addVar(recorder.id + '.lookup',
              Math.round(entries[e].domainLookupEnd -
                entries[e].domainLookupStart));
          }
          if (entries[e].connectStart && entries[e].connectEnd) {
            BOOMR.addVar(recorder.id + '.conn',
              Math.round(entries[e].connectEnd - entries[e].connectStart));
          }
        }
      }
    }
    BOOMR.debug('Push vars to cb: '.concat(impl.sendVars), 'cb');
    // Push vars to beacon
    var cbq = window._cbq ? window._cbq : window._cbq = [];
    var vlen = impl.sendVars.length;
    for (var v = 0; v < vlen; v++) {
      var b_var = impl.sendVars[v];
      if (vars[b_var]) {
        cbq.push(['_'.concat(b_var), vars[b_var]]);
      }
    }
  },

  /**
   * Times the loading of an elment
   * @param el Element which will be timed
   * @param recorder object which records timers
   */
  loadTimer: function(el, recorder) {
    recorder.start = BOOMR.now();
    recorder.path = el.src;
    impl._timedLoads[recorder.path] = recorder;
    var onLoad = function() {
      recorder.done = BOOMR.now();
      recorder.loadtime = recorder.done - recorder.start;
      BOOMR.debug(BOOMR.utils.objectToString(recorder), 'cb');
      BOOMR.addVar(recorder.id + '.load', recorder.loadtime);
      // check if we're waiting on other timers
      var isWaiting = false;
      for (var r in impl._timedLoads) {
        if (!impl._timedLoads[r].loadtime) {
          isWaiting = true;
          break;
        }
      }
      // We will only hold up the beacon if we know we have a timer that
      // hasn't finished yet. If it hasn't started, it may not be returned.
      if (isWaiting) {
        impl._is_complete = false;
      } else {
        impl._is_complete = true;
        BOOMR.sendBeacon();
      }
      BOOMR.utils.removeListener(el, 'load', onLoad);
    };
    BOOMR.utils.addListener(el, 'load', onLoad);
  }

};

BOOMR.plugins.CB = {

  init: function(config) {
    BOOMR.utils.pluginConfig(impl, config, 'CB', ['sendVars']);

    BOOMR.subscribe('before_beacon', impl.updateCbVars, null, impl);
    return this;
  },

  is_complete: function() {
    return impl._is_complete;
  },

  /**
   * Times the loading of chartbeat js
   * @param script Element chartbeat js which will be timed.
   */
  jsTimer: function(script) {
    var recorder = {'id': 'cb.js'};
    impl.loadTimer(script, recorder);
  },

  /**
   * Times the loading of any element
   * @param rs Element resource which will be timed.
   * @param id string unique id for timed resource.
   */
  resourceTimer: function(rs, id) {
    var recorder = {'id': id};
    impl.loadTimer(rs, recorder);
  },

  /**
   * Returns pageLoadTime for pinger
   * @return number pageLoadTime.
   */
  getPageLoadTime: function() {
    return impl._pageLoadTime;
  }
};

}(window));

