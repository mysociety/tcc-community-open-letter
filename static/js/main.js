// A handy place to keep references to things that are
// hard to infer or pull out from the DOM directly.
var refs = {
    map: undefined,
    boundariesLayer: undefined,
    currentBoundariesGroup: undefined,
    selectedBoundariesGroup: undefined
};

// Kick off an ajax request, immediately, for the ~7MB boundaries
// JSON file. By assigning a jQuery promise here, we can just call
// loadBoundaries.done(function(data){…}) at any time in our code,
// and the callback function will receive the boundaries data,
// either immediately or as soon as the ajax request completes.
var loadBoundaries = $.ajax({
    dataType: "json",
    url: window.baseurl + '/static/js/wmc23.json'
}).promise();


// Using _another_ jQuery promise here, so that we only have to
// set up the Leaflet map once, and then we can call loadMap.done(…)
// to get 
var loadMap = (function(){
    var $dfd = new $.Deferred();

    if (typeof refs.map === 'undefined') {
        refs.map = L.map('inspectorMap', {
            center: [54.0934, -2.8948],
            zoom: 7
        });
        L.tileLayer(
            'https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=7ac28b44c7414ced98cd4388437c718d',
            {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }
        ).addTo(refs.map);
    }

    loadBoundaries.done(function(boundariesData){
        $dfd.resolve(refs.map, boundariesData);
    });

    return $dfd.promise();
})();


var featureStyles = {
    "disabled": {
        weight: 2,
        color: '#CCC',
        fillOpacity: 0
    },
    "selected": {
        weight: 4,
        color: '#89c489',
        fillOpacity: 0.8
    },
    "selectedHover": {
        weight: 4,
        color: '#89c489',
        fillOpacity: 1
    },
    "deselected": {
        weight: 2,
        color: '#21a8e0',
        fillOpacity: 0
    },
    "deselectedHover": {
        weight: 2,
        color: '#21a8e0',
        fillOpacity: 0.2
    }
};


var inspectSignatory = function(name){
    var $inspector = $('#inspector');
    var signatory = _.findWhere(window.signatories, {"name": name});

    $('#inspectorTitle').text(signatory.name);
    $('#inspectorInputSignatory').val(signatory.name);
    $('#inspectorInputVerdict').val('Yes, your data is correct');

    $('#inspectorReject').on('click', function(){
        $inspector.addClass('editing');
        $('#inspectorInputVerdict').val('No, your data is incorrect');
        updateFeatureShading();
    });

    $('#inspectorCancelEdit').on('click', function(){
        $inspector.removeClass('editing');
        $('#inspectorInputVerdict').val('Yes, your data is correct');
        updateFeatureShading();
    });

    loadMap.done(function(_map, boundariesData){
        // Create FeatureGroups to store the current and overridden
        // constituencies.
        // When we’re done inspecting this particular constituency,
        // the FeatureGroups will be deleted by resetInspector().
        refs.currentBoundariesGroup = L.featureGroup().addTo(refs.map);
        refs.selectedBoundariesGroup = L.featureGroup().addTo(refs.map);

        refs.boundariesLayer = L.geoJSON(
            boundariesData,
            {
                style: featureStyles.disabled,
                onEachFeature: function(feature, layer){
                    var tooltipHTML = '<strong>' + feature.properties.constituency_name + '</strong>';
                    if (feature.properties.mp_name && feature.properties.mp_party) {
                        tooltipHTML += ' <span class="d-block mt-1">' + feature.properties.mp_name + ', ' + feature.properties.mp_party + '</span>';
                    }
                    layer.bindTooltip(tooltipHTML, {
                        sticky: true,
                        className: "pe-none" // prevent flicker when mousing over tooltip
                    });

                    layer.on('mouseover', function(e){
                        var isSelected = refs.selectedBoundariesGroup.hasLayer(layer);
                        if (isEditing()) {
                            this.setStyle(isSelected ? featureStyles.selectedHover : featureStyles.deselectedHover);
                        }
                    });

                    layer.on('mouseout', function(){
                        var isSelected = refs.selectedBoundariesGroup.hasLayer(layer);
                        if (isEditing()) {
                            this.setStyle(isSelected ? featureStyles.selected : featureStyles.deselected);
                        }
                    });

                    layer.on('click', function(e){
                        if (isEditing()) {
                            if (refs.selectedBoundariesGroup.hasLayer(layer)) {
                                refs.selectedBoundariesGroup.removeLayer(layer);
                                refs.map.addLayer(layer);
                            } else {
                                refs.selectedBoundariesGroup.addLayer(layer);
                            }
                        }
                    });
                }
            }
        ).addTo(refs.map);

        var selectedGSSCodes = _.pluck(signatory.items, 'constituency_gss');

        updateSignatoryConstituencyLists(selectedGSSCodes, boundariesData);

        refs.selectedBoundariesGroup.on('layeradd', function(data){
            // Update map
            data.layer.setStyle(featureStyles.selected);
            if (refs.selectedBoundariesGroup.getLayers().length) {
                refs.map.fitBounds(refs.selectedBoundariesGroup.getBounds(), { padding: [50, 50] });
                refs.selectedBoundariesGroup.bringToFront();
            }

            // Update DOM
            var gss_code = data.layer.feature.properties.gss_code;
            selectedGSSCodes = _.union(selectedGSSCodes, [gss_code]);
            updateSignatoryConstituencyLists(selectedGSSCodes, boundariesData);
        });

        refs.selectedBoundariesGroup.on('layerremove', function(data){
            // Update map
            data.layer.setStyle(featureStyles.deselected);
            if (refs.selectedBoundariesGroup.getLayers().length) {
                refs.map.fitBounds(refs.selectedBoundariesGroup.getBounds(), { padding: [50, 50] });
                refs.selectedBoundariesGroup.bringToFront();
            }

            // Update DOM
            var gss_code = data.layer.feature.properties.gss_code;
            selectedGSSCodes = _.without(selectedGSSCodes, gss_code);
            updateSignatoryConstituencyLists(selectedGSSCodes, boundariesData);
        });

        // Now, finally, add the "selected" constituencies to our two
        // FeatureGroups, so they can be styled by updateFeatureShading().
        _.each(refs.boundariesLayer.getLayers(), function(layer){
            if (selectedGSSCodes.indexOf(layer.feature.properties.gss_code) > -1) {
                layer.addTo(refs.currentBoundariesGroup);
                layer.addTo(refs.selectedBoundariesGroup);
            }
        });
    });
};


var updateFeatureShading = function(){
    refs.boundariesLayer.eachLayer(function(layer){
        if (isEditing()) {
            if (refs.selectedBoundariesGroup.hasLayer(layer)) {
                layer.setStyle(featureStyles.selected);
            } else {
                layer.setStyle(featureStyles.deselected);
            }
        } else {
            if (refs.currentBoundariesGroup.hasLayer(layer)) {
                layer.setStyle(featureStyles.selected);
            } else {
                layer.setStyle(featureStyles.disabled);
            }
        }
    });
};


var updateSignatoryConstituencyLists = function(selectedGSSCodes, boundariesData){
    $('.constituency-list').empty().each(function(){
        var $list = $(this);
        _.each(selectedGSSCodes, function(gss_code){
            var constituency = _.find(boundariesData.features, function(feature){
                return feature.properties.gss_code == gss_code;
            });
            var $li = $('<li>').text(constituency.properties.constituency_name);
            if(constituency.properties.mp_name && constituency.properties.mp_party) {
                $('<small>').text(constituency.properties.mp_name + ', ' + constituency.properties.mp_party).appendTo($li);
            }
            $li.appendTo($list);
        });
    });
    $('#inspectorInputConstituenciesRaw').val(selectedGSSCodes.join(';'));
};


var resetInspector = function(){
    $('#inspector').removeClass('editing');

    $('#inspectorTitle').text('Inspector');
    $('#inspectorInputName').val('');
    $('#inspectorInputEmail').val('');
    $('#inspectorInputSignatory').val('');
    $('#inspectorInputConstituenciesRaw').val('');
    $('.constituency-list').empty();

    if ( refs.currentBoundariesGroup ) {
        refs.map.removeLayer(refs.currentBoundariesGroup);
        refs.currentBoundariesGroup = undefined;
    }
    if ( refs.selectedBoundariesGroup ) {
        refs.map.removeLayer(refs.selectedBoundariesGroup);
        refs.selectedBoundariesGroup = undefined;
    }
};


var isEditing = function(){
    return $('#inspector').is('.editing');
};


// Used when comparing strings in the search filter.
var standardiseText = function(string){
    return string.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
};


$(function(){
    $('#search').on('keyup', function(){
        var needle = standardiseText( $(this).val() );
        if ( needle !== '' ) {
            $('#signatories tbody tr').each(function(){
                var haystack = standardiseText( $(this).text() );
                if ( haystack.indexOf(needle) > -1 ) {
                    $(this).removeClass('d-none');
                } else {
                    $(this).addClass('d-none');
                }
            });
        } else {
            $('#signatories tbody tr').removeClass('d-none');
        }
    });

    var inspectorOffcanvas = new bootstrap.Offcanvas('#inspector');

    $('#inspector')[0].addEventListener('hidden.bs.offcanvas', event => {
       resetInspector();
    });

    resetInspector();

    $('tr[data-signatory]').on('click', function(){
        inspectSignatory( $(this).attr('data-signatory') );
        inspectorOffcanvas.show();
    });

    $('.js-save-form').on('click', function(){
        var $form = $('#inspectorEdit');
        fetch($form.prop('action') + '?' + $form.serialize(), {
            method: $form.prop('method'),
            mode: 'no-cors',
            cache: 'no-cache',
            credentials: 'omit',
            headers: {
                "Content-Type": 'application/x-www-form-urlencoded'
            }
        });
    });
});
