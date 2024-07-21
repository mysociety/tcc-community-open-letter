var standardiseText = function(string){
    return string.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

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
});
