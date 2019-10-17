console.log("IN login.js");
// $('#signInForm')
//     .ajaxForm({
//         url: '/login',
//         method: "POST",
//         // dataType: 'json',
//         data: new FormData($(this)),
//         success: function (response) {
//             $.ajax({
//                 url: '/login',
//                 method: 'GET',
//                 dataType: 'json',
//                 success: function (data) {
//                     // console.log("The server says: " + response);
//                     $("#login").remove();
//                     console.log("displaying home");
//                     document.getElementById("home").innerHTML = data;
//                 }
//             });
//         }
//     });


$('#signInForm').submit((e) => {
    document.getElementById("error").innerHTML = "&nbsp";
    $.ajax({
        url: $('#signInForm').attr('action'),
        type: 'POST',
        data: $('#signInForm').serialize(),
        success: (response) => {
            console.log('form submitted.');
            console.log("the response is " + JSON.stringify(response));
            if (response.status === "OK") {
                window.location.href = "/home";
            }
            else {
                console.log("ERROR: INCORRECT U/P");
                document.getElementById("error").innerHTML = "Incorrect username/password."
            }
        }
    });
    e.preventDefault();
});