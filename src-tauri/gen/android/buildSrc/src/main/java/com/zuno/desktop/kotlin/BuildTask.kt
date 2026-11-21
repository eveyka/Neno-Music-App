import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = if (Os.isFamily(Os.FAMILY_WINDOWS)) "npm.cmd" else "npm"
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "npm.cmd",
                    "npm.exe",
                    "npm.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script")

        val envNdk = System.getenv("NDK_HOME") ?: System.getenv("ANDROID_NDK_HOME") ?: System.getenv("ANDROID_NDK")
        val ndkDir = if (envNdk != null && File(envNdk).exists()) {
            File(envNdk)
        } else {
            val sdkDir = File(System.getenv("ANDROID_HOME") ?: "C:/Users/wwwro/AppData/Local/Android/Sdk")
            val ndkParent = File(sdkDir, "ndk")
            val installedNdks = ndkParent.listFiles()?.filter { it.isDirectory }?.sortedDescending()
            installedNdks?.firstOrNull() ?: File(ndkParent, "26.1.10909125")
        }

        val isWindows = Os.isFamily(Os.FAMILY_WINDOWS)
        val isMac = Os.isFamily(Os.FAMILY_MAC)
        val hostTag = when {
            isWindows -> "windows-x86_64"
            isMac -> "darwin-x86_64"
            else -> "linux-x86_64"
        }
        val llvmBin = File(ndkDir, "toolchains/llvm/prebuilt/$hostTag/bin")

        val sdkDir = ndkDir.parentFile?.parentFile ?: File(System.getenv("ANDROID_HOME") ?: "C:/Users/wwwro/AppData/Local/Android/Sdk")
        val cmakeParent = File(sdkDir, "cmake")
        val installedCmakes = cmakeParent.listFiles()?.filter { it.isDirectory }?.sortedDescending()
        val cmakeDir = installedCmakes?.firstOrNull() ?: File(cmakeParent, "3.22.1")
        val cmakeBin = File(cmakeDir, "bin")
        val ninjaExe = if (isWindows) File(cmakeBin, "ninja.exe") else File(cmakeBin, "ninja")
        val toolchain = File(ndkDir, "build/cmake/android.toolchain.cmake")
        val currentPath = System.getenv("PATH") ?: ""
        val pathSeparator = File.pathSeparator

        val abi = when (target) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> "arm64-v8a"
        }

        val wrapperDir = File(project.projectDir, "build")
        wrapperDir.mkdirs()
        val wrapperToolchain = File(wrapperDir, "tauri-toolchain-$target.cmake")
        wrapperToolchain.writeText(
            """
            set(ANDROID_ABI "$abi" CACHE STRING "" FORCE)
            set(ANDROID_PLATFORM "26" CACHE STRING "" FORCE)
            include("${toolchain.absolutePath.replace("\\", "/")}")
            """.trimIndent()
        )

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            environment("PATH", "${llvmBin.absolutePath}$pathSeparator${cmakeBin.absolutePath}$pathSeparator$currentPath")
            environment("ANDROID_NDK", ndkDir.absolutePath)
            environment("ANDROID_NDK_HOME", ndkDir.absolutePath)
            environment("NDK_HOME", ndkDir.absolutePath)
            environment("ANDROID_ABI", abi)
            environment("CMAKE_TOOLCHAIN_FILE", wrapperToolchain.absolutePath)
            if (ninjaExe.exists()) {
                environment("CMAKE_MAKE_PROGRAM", ninjaExe.absolutePath)
            }
            environment("CMAKE_GENERATOR", "Ninja")
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}