console.log("IN login.js");
$('#signInForm')
    .ajaxForm({
        url: 'login',
        method: "POST",
        dataType: 'json',
        success: function (response) {
            $.ajax({
                url: '/login',
                method: 'GET',
                dataType: 'json',
                success: function (data) {
                    // console.log("The server says: " + response);
                    $("#login").remove();
                    console.log("displaying home");
                    document.getElementById("home").innerHTML = data;
                }
            });
        }
    });
;
