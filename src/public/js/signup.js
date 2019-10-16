console.log("IN SIGNUP.JS");
$('#form')
    .ajaxForm({
        url : 'adduser', // or whatever
        dataType : 'json',
        success : function (response) {
            alert("The server says: " + response);
        }
    })
;