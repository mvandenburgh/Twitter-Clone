console.log("IN SIGNUP.JS");
$('#form')
    .ajaxForm({
        url: 'adduser', // or whatever
        dataType: 'json',
        success: function (response) {
            $.ajax({
                url: "/verify",
                type: "GET",
                success: function (data) {
                    console.log("The server says: " + response);
                    $("#root").remove();
                    console.log("displaying verify");
                    document.getElementById("verify").innerHTML = data;
                }
            });
        }
    })
    ;
