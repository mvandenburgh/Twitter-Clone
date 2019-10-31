$(document).ready(() => {
    console.log("IN SIGNUP.JS");
    $('#form')
        .ajaxForm({
            url: 'adduser',
            dataType: 'json',
            success: (response) => {
                // console.log(response);
                if (response.status == "error") {
                    document.getElementById("error").innerHTML = response.error;
                }
                else {
                    $.ajax({
                        url: "/verify",
                        type: "GET",
                        success: (data) => {
                            console.log("The server says: " + response);
                            $("#root").remove();
                            console.log("displaying verify");
                            document.getElementById("verify").innerHTML = data;
                            console.log("#form1");
                            $('#form1').submit((e) => {
                                console.log(e + " inside verifyForm");
                                e.preventDefault();
                                $.ajax({
                                    type: 'POST',
                                    url: '/verify',
                                    data: $("#form1").serialize(),
                                    dataType: 'json',
                                    success: (response) => {
                                        console.log("SUCCESS " + response);
                                        console.log('form submitted.');
                                        console.log("the response is " + JSON.stringify(response));
                                        if (response.status === "OK") {
                                            alert("Verification successful, please login.");
                                            window.location.href = "/";
                                        }
                                        else {
                                            console.log("ERROR: INCORRECT U/P");
                                            window.location.href = "/";
                                        }
                                    }
                                });
                            });
                        }
                    });
                }
            }
        });
});