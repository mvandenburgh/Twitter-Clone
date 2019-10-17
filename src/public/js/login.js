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
    $.ajax({
      url: $('#signInForm').attr('action'),
      type: 'POST',
      data : $('#signInForm').serialize(),
      success: (response) => {
        console.log('form submitted.');
        console.log("the response is " + JSON.stringify(response));
        $.ajax({
            url: '/home',
            type: 'GET',
            success: (data) => {
                $("#login").remove();
                console.log("displaying home");
                document.getElementById("home").innerHTML = data;
            }
        });
      }
    });
    e.preventDefault();
});