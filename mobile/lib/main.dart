import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// 기본 접속 주소. 앱 안의 "주소 바꾸기"로 언제든 바꿀 수 있어요.
/// - 같은 와이파이의 PC에서 개발 서버를 켠 경우: PC의 IP + 포트
/// - 에뮬레이터: http://10.0.2.2:3002
/// - 배포 후: https://배포주소
const String kDefaultUrl = 'http://192.168.45.45:3002/login';
const String kPrefKey = 'salonai.url';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));
  runApp(const SalonaiApp());
}

class SalonaiApp extends StatelessWidget {
  const SalonaiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SALONAI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF7867DB)),
        useMaterial3: true,
      ),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController _controller;
  String _url = kDefaultUrl;
  bool _loading = true;
  String? _error;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFFBF7F8))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() {
          _loading = true;
          _error = null;
        }),
        onPageFinished: (_) => setState(() => _loading = false),
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? true) {
            setState(() {
              _loading = false;
              _error = e.description;
            });
          }
        },
      ));
    _boot();
  }

  Future<void> _boot() async {
    final prefs = await SharedPreferences.getInstance();
    _url = prefs.getString(kPrefKey) ?? kDefaultUrl;
    await _controller.loadRequest(Uri.parse(_url));
    if (mounted) setState(() => _ready = true);
  }

  Future<void> _changeUrl() async {
    final input = TextEditingController(text: _url);
    final next = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('주소 바꾸기'),
        content: TextField(
          controller: input,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'http://192.168.0.10:3002/login'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(ctx, input.text.trim()), child: const Text('저장')),
        ],
      ),
    );
    if (next == null || next.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(kPrefKey, next);
    setState(() {
      _url = next;
      _error = null;
    });
    await _controller.loadRequest(Uri.parse(next));
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _controller.canGoBack()) {
          await _controller.goBack();
        } else {
          SystemNavigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFFBF7F8),
        body: SafeArea(
          child: Stack(
            children: [
              if (_ready) WebViewWidget(controller: _controller),
              if (_loading) const LinearProgressIndicator(minHeight: 2),
              if (_error != null)
                Container(
                  color: const Color(0xFFFBF7F8),
                  padding: const EdgeInsets.all(28),
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('SALONAI', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 2)),
                      const SizedBox(height: 14),
                      const Text('서버에 연결하지 못했어요.', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Text(_url, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54)),
                      const SizedBox(height: 4),
                      const Text('같은 와이파이인지, PC에서 개발 서버가 켜져 있는지 확인해 주세요.',
                          textAlign: TextAlign.center, style: TextStyle(color: Colors.black54, fontSize: 13)),
                      const SizedBox(height: 20),
                      FilledButton(
                        onPressed: () {
                          setState(() => _error = null);
                          _controller.loadRequest(Uri.parse(_url));
                        },
                        child: const Text('다시 시도'),
                      ),
                      TextButton(onPressed: _changeUrl, child: const Text('주소 바꾸기')),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
