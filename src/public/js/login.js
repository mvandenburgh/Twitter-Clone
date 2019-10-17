console.log("IN login.js");
$('#signInForm')
    .ajaxForm({
        url: 'login',
        dataType: 'json',
        success: function (response) {
            alert(respose);
            // $.ajax({
                
            // });
        }
    })
    ;
