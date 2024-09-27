<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Youssef Hassan - GitHub Profile</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap">
    <style>
        :root {
            --primary-color: #4CAF50;
            --secondary-color: #009688;
            --accent-color: #FF5733;
            --bg-color: #f0f0f0;
            --text-color: #333;
        }

        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, var(--bg-color) 0%, #c3cfe2 100%);
            color: var(--text-color);
            line-height: 1.6;
            padding: 20px;
            transition: all 0.3s ease;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: rgba(255, 255, 255, 0.9);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        h1, h3 {
            text-align: center;
        }

        h1 {
            font-size: 3.5em;
            color: var(--primary-color);
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
            animation: rainbow 5s linear infinite;
        }

        h3 {
            font-size: 1.8em;
            color: var(--secondary-color);
            margin-bottom: 30px;
        }

        .profile-image {
            display: block;
            margin: 0 auto;
            border-radius: 20px;
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
            max-width: 100%;
            height: auto;
            animation: float 3s ease-in-out infinite;
        }

        .stats-container {
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
            margin-top: 30px;
        }

        .stats-item {
            flex: 1;
            min-width: 300px;
            margin: 10px;
            text-align: center;
        }

        .stats-item img {
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease;
        }

        .stats-item img:hover {
            transform: translateY(-5px);
        }

        .tools-container {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 20px;
            margin-top: 30px;
        }

        .tool-icon {
            width: 50px;
            height: 50px;
            transition: transform 0.3s ease;
            opacity: 0; /* Initially hidden for fade-in effect */
        }

        @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
            100% { transform: translateY(0px); }
        }

        @keyframes rainbow {
            0% { color: #ff0000; }
            14% { color: #ff7f00; }
            28% { color: #ffff00; }
            42% { color: #00ff00; }
            57% { color: #0000ff; }
            71% { color: #8b00ff; }
            85% { color: #ff00ff; }
            100% { color: #ff0000; }
        }

        .social-icons {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 20px;
        }

        .social-icons img {
            transition: transform 0.3s ease;
        }

        .social-icons img:hover {
            transform: scale(1.2);
        }

        ul {
            list-style-type: none;
            padding: 0;
            text-align: center;
        }

        ul li {
            margin-bottom: 10px;
            transition: transform 0.3s ease;
        }

        ul li:hover {
            transform: translateX(10px);
        }

        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            transition: background 0.3s ease;
        }

        .theme-toggle:hover {
            background: var(--secondary-color);
        }

        .dark-theme {
            --bg-color: #2c3e50;
            --text-color: #ecf0f1;
        }
    </style>
</head>
<body>
    <button class="theme-toggle" onclick="toggleTheme()">Toggle Theme</button>
    <div class="container">
        <h1>Hi 👋, I'm Youssef Hassan</h1>
        <h3>A passionate Software Engineer</h3>
        
        <img src="https://imgs.search.brave.com/JOdRDA2MfpN3UN0lYBLC-yaVsgltfBirSMddr2p9XYE/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vbGlhbnBlcnNvbi81ZjBmNTI2MDRiMDNhZDgwYzgyZGI3OTBjNDc0OTkzYy9yYXcvODhmMjBjOWQ3NDlkNzU2YmU2M2YyMmIwOWYzYzRhYzU3MGJjNTEwMS9wcm9ncmFtbWluZy5naWY.gif" alt="Coding" class="profile-image">
        
        <h3>🌱 I'm currently learning <span style="color: var(--accent-color);">MERN Stack & CyberSecurity</span></h3>
        
        <ul>
            <li>👨‍💻 All of my projects are available at <a href="https://github.com/YoussefHassanDEV" target="_blank">My GitHub</a></li>
            <li>💬 Ask me about <strong>React.js, Node.js</strong></li>
            <li>📫 How to reach me: <strong>devyoussefhassan@gmail.com</strong></li>
            <li>📄 Know about my experiences: <a href="https://drive.google.com/file/d/15lwYHMq5VeyUpSG5tFBsC4v6R9JSyZ_c/view?usp=sharing" target="_blank">My Resume</a></li>
        </ul>
        
        <h3>Connect with me:</h3>
        <div class="social-icons">
            <a href="https://linkedin.com/in/youssef-hassan" target="_blank">
                <img src="https://raw.githubusercontent.com/rahuldkjain/github-profile-readme-generator/master/src/images/icons/Social/linked-in-alt.svg" alt="LinkedIn" height="30" width="40">
            </a>
            <a href="https://codeforces.com/profile/youssefhassan_" target="_blank">
                <img src="https://raw.githubusercontent.com/rahuldkjain/github-profile-readme-generator/master/src/images/icons/Social/codeforces.svg" alt="Codeforces" height="30" width="40">
            </a>
        </div>
        
        <h3>Languages and Tools:</h3>
        <div class="tools-container">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg" alt="JavaScript" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg" alt="TypeScript" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original-wordmark.svg" alt="HTML5" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/cplusplus/cplusplus-original.svg" alt="C++" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/c/c-original.svg" alt="C" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/java/java-original.svg" alt="Java" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original-wordmark.svg" alt="CSS3" class="tool-icon">
            <img src="https://www.vectorlogo.zone/logos/tailwindcss/tailwindcss-icon.svg" alt="Tailwind CSS" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original.svg" alt="React" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/nodejs/nodejs-original.svg" alt="Node.js" class="tool-icon">
            <img src="https://raw.githubusercontent.com/devicons/devicon/master/icons/git/git-original.svg" alt="Git" class="tool-icon">
        </div>
    </div>

    <script>
        function toggleTheme() {
            document.body.classList.toggle('dark-theme');
        }

        // Fade-in effect for tool icons
        window.onload = () => {
            const tools = document.querySelectorAll('.tool-icon');
            tools.forEach((tool, index) => {
                setTimeout(() => {
                    tool.style.opacity = 1; // Set opacity to 1 after delay
                }, index * 200); // Delay for each icon
            });
        };
    </script>
</body>
</html>
