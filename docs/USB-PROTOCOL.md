# USB 宠物协议 v1 与 Flash 更新约束

本协议连接 `firmware/pet_usb` 与 `plugin`。Windows 传输适配器使用 CH343／115200／8N1，当前固件 1.1.1 的物理采样顺序固定为 GPIO4、6、7、5；每片对应的身体部位由电脑上的可视化配对决定。兼容旧 1.1.0 四路和 1.0.0 三路；握手中的 zones 保留历史默认标签，不代表已确认的实际安装位置。供电维持 3V3 和公共 GND。

## 身份与连接

插件枚举 VID=1A86/PID=55D3 的已连接端口；多块同类板时不自动选一块。打开串口不脉冲 DTR/RTS、不自动进入下载模式。COM 编号只是临时地址，不能作为宠物身份。

主机发送 `PET/1 HELLO <32位十六进制随机nonce>\n`，设备返回 JSON 行：

```json
{"type":"hello","protocol":1,"product":"loveandrobot.pet","firmware":"1.1.1","board":"esp32s3-n8r8","device_id":"LR-XXXXXXXXXXXX","boot_id":"XXXXXXXXXXXXXXXX","nonce":"主机本次随机值","pins":[4,6,7,5],"zones":["head","left_hand","back","right_hand"],"adc_bits":12,"sample_ms":20}
```

只有身份、版本、nonce 与通道映射全部匹配才接受。主机按握手确定后续帧必须为三路或四路；未知宽度或顺序直接拒绝。升级到四路后旧三路基线不自动扩展，必须重新校准。device_id 从出厂 eFuse MAC 只读获取；boot_id 是本次启动的随机数，只在 RAM 中存在。该握手用于兼容验证与绑定辨认，不是防克隆认证。

`PET/1 START <nonce>` 开始数据上报；主机每秒发送 `PET/1 PING <nonce>`，5 秒没有有效心跳设备停止上报。`PET/1 STOP <nonce>` 主动停止。每条命令一行，固件最多保存 95 字节，溢出行整体丢弃，每轮最多处理 64 个输入字节；不支持写任意 GPIO、任意内存、擦除、OTA 或 Flash 操作。

采样行示例：

```json
{"type":"sample","seq":42,"ms":10020,"raw":[4095,3200,4095,4095]}
```

序号和设备时间都是 uint32，可自然回绕；插件拒绝重复和倒退序号，跳号清空暂存触碰。每路是 0～4095 原始 ADC 值，不能标为牛顿或克。单帧超过 1024 字节、累计输入超过 64 KiB、非法字段均关闭连接并报告。设备重新启动需重新握手，旧事件不重放。

## 状态归属

设备：固件、只读出厂身份、RAM 会话 nonce／boot_id／序号／采样值。1.1.1 的业务逻辑不保存数据，并显式阻止 Arduino 底层 NVS 初始化与自动 OTA 元数据更新；旧版本仅能保证业务代码未主动保存。详见 LIFECYCLE-AUDIT-20261031.md。

电脑：宠物名、设备绑定、校准基线、关联 Harness 聊天、触碰事件处理。聊天和模型凭据继续由 Harness 管理；插件没有自己的模型密钥。只向已绑定聊天发送事件摘要，原始采样不逐帧交给模型。

## 固件构建与升级

`pet-firmware.ps1` 固定已验证的 ESP32-S3/N8R8 设置、8 MB QIO Flash／OPI PSRAM／default_8MB 分区。编译后检查镜像不超过 ota_0 的 0x330000 字节。

升级流程先读回 0x8000 处 4 KiB 分区表，与编译产物逐字节比较；再读回 0xE000 处 8 KiB 启动选择，与工具链 `boot_app0.bin` 完整比较。不一致即停止，不以猜测的 OTA 序号继续。当前设备两份启动文件 SHA256 相同：`F94C5D786A7A8FAB06AC5D10E33BF37711A6697636DC037559EA19CC410A17F0`。

随后备份旧应用槽 0x10000～0x33FFFF，记录 SHA256，最后仅通过 esptool `write-flash --skip-flashed 0x10000 <app.bin>` 更新应用并验证哈希。不会发出 erase-all，不改分区表、bootloader、启动选择、NVS 或 eFuse。正常刷写仍会擦写应用覆盖的扇区，因此不作“零风险”承诺；不要在刷写中拔线。

此脚本是已有匹配布局设备的升级入口。新板先按本仓库已经记录的板型核对与主板初始化流程建立匹配布局；其他板型／布局会被拒绝，不能直接套用地址。旧原厂 8 MiB 全量备份和每次升级前应用备份保留在 `.tools/backups`。

## 已完成的真实检查

2026-10-31：`pet_usb` 编译占用 309289 字节程序、22780 字节静态内存；应用区上传校验通过。真实设备握手返回独立设备编号（公开文档省略具体编号），固件 1.0.0／协议 1；Windows 桥接握手、201 帧三路读取、关闭串口通过，空载各路 4095。

插件 0.1.1 已安装在真实 Harness Desktop 0.2.1-rc.5。设备已绑定并命名 youyou，完成 3 秒校准和角色开场；北京时间 15:15～15:16 的真实按压产生 belly、back、head 各两组开始／释放，共 6 组模型回应，已通过 Harness 可访问性文本核验对应区域的实际文字回复。最后三路返回 4095。新版协议下尚未单独实测长按 1.5 秒以上、拔线重连和装入娃娃后的触碰表现；相关去重／过期／状态持久化逻辑有自动测试，不能当作这些物理场景的验收。

官方参考：[Harness 插件架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[Agent 消息入口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)、[Espressif Flash 工具](https://docs.espressif.com/projects/esptool/en/latest/esp32s3/esptool/basic-commands.html)。插件实际接口已对照本机打包的 0.2.1-rc.5 代码，而不是只依赖 master 文档。

## 0.3.0 四部位扩展

固件 1.1.0 已编译：程序 309365 字节、静态内存 22780 字节。该版本业务代码未主动保存，但底层启动保护由 1.1.1 补齐，不能把 1.1.0 视为完整的零写入实现。复杂动作逻辑在电脑 `src/touch.mjs`，各部位规则在 `src/body.mjs`；详见 TOUCH-INTERACTIONS.md。物理四路接线和新手势验收应以最新实际记录为准，编译和自动测试不替代硬件验收。

2026-10-31 16:21：1.1.0 已应用区单独升级、哈希校验通过；原程序备份 pet-upgrade-20261031-162058。随后 201 帧四路空载采样通过，各路 4095，四路重新校准通过。0.3.1 的部位设置只改变电脑中的 channelMap，不再刷写固件；握手 zones 仅为历史默认标签，物理采样顺序仍为 pins 的固定顺序。

## 1.1.1 启动与协议加固

兼容 1.0.0、1.1.0；当前推荐 1.1.1。新增 ELF 保护校验，阻止 NVS 启动初始化与自动 OTA 元数据修改；START／PING／STOP 精确匹配参数，非法控制字符和超长行整体丢弃。升级脚本还在上传和新程序启动后对前 64 KiB 做哈希比对。具体测试记录和限制见 LIFECYCLE-AUDIT-20261031.md。

