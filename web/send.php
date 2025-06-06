<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $to = "din@epostadress.se";  // <-- Ändra till din e-postadress
    $subject = "Nytt meddelande från kontaktformuläret";
    $name = strip_tags($_POST["name"]);
    $email = filter_var($_POST["email"], FILTER_SANITIZE_EMAIL);
    $message = htmlspecialchars($_POST["message"]);

    $headers = "Från: $name <$email>\r\n";
    $headers .= "Svar till: $email\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";

    $mailBody = "Namn: $name\nE-post: $email\n\nMeddelande:\n$message";

    if (mail($to, $subject, $mailBody, $headers)) {
        header("Location: kontakt.html?status=sent");
        exit;
    } else {
        echo "Ett fel uppstod. Vänligen försök igen.";
    }
} else {
    http_response_code(403);
    echo "Otillåten begäran.";
}
