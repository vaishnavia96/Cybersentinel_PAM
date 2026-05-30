#!/bin/bash

COMMUNITY="NagpurNMS123"
NMS_IP="192.168.1.96"
SNMP_CONF="/etc/snmp/snmpd.conf"

if [ "$EUID" -ne 0 ]; then
    echo "Run with sudo"
    exit 1
fi

echo "Installing SNMP..."

if command -v apt >/dev/null 2>&1; then
    apt update -y
    apt install -y snmpd snmp
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y net-snmp net-snmp-utils
elif command -v yum >/dev/null 2>&1; then
    yum install -y net-snmp net-snmp-utils
else
    echo "Unsupported OS"
    exit 1
fi

echo "Backing up config..."
cp $SNMP_CONF ${SNMP_CONF}.bak

echo "Writing SNMP config..."

cat > $SNMP_CONF <<EOF
agentAddress udp:161

rocommunity $COMMUNITY $NMS_IP

sysLocation DataCenter
sysContact admin@example.com

includeDir /etc/snmp/snmpd.conf.d
EOF

echo "Restarting SNMP..."
systemctl restart snmpd
systemctl enable snmpd

echo "Opening firewall..."

if command -v ufw >/dev/null 2>&1; then
    ufw allow 161/udp
fi

if command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --add-port=161/udp --permanent
    firewall-cmd --reload
fi

echo ""
echo "SNMP setup completed"
echo ""
echo "Community: $COMMUNITY"
echo "Allowed NMS: $NMS_IP"
echo ""
echo "Test from NMS server:"
echo "snmpwalk -v2c -c $COMMUNITY <SERVER-IP> system"
